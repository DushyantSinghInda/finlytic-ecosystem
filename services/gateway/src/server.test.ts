import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { createGatewayServer } from './server.ts';
import type { GatewayConfig } from './config.ts';

interface Received {
	method: string | undefined;
	url: string | undefined;
	headers: Record<string, string | string[] | undefined>;
	body: string;
}

/** A real upstream, small enough to assert against: it records and echoes. */
function stubUpstream(name: string, log: Received[]): Server {
	return createServer((req, res) => {
		const chunks: Buffer[] = [];

		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', () => {
			log.push({
				method: req.method,
				url: req.url,
				headers: req.headers,
				body: Buffer.concat(chunks).toString('utf8'),
			});

			res.writeHead(200, {
				'content-type': 'application/json',
				'x-upstream': name,
			});
			res.end(JSON.stringify({ upstream: name }));
		});
	});
}

/** Port 0 = let the OS pick. Hard-coded ports make suites collide with dev servers. */
function listen(server: Server): Promise<number> {
	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			resolve(
				typeof address === 'object' && address !== null ? address.port : 0,
			);
		});
	});
}

function close(server: Server): Promise<void> {
	// closeAllConnections runs first: fetch keeps sockets alive and close() waits
	// for them, so without it the runner hangs after the last test.
	server.closeAllConnections();

	return new Promise((resolve) => {
		server.close(() => resolve());
	});
}

// Tokens are minted here rather than shared with jwt.test.ts so each file runs
// on its own.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
});

function segment(value: object): string {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function validToken(): string {
	const now = Math.floor(Date.now() / 1000);
	const input =
		`${segment({ alg: 'RS256', typ: 'JWT' })}.` +
		segment({
			sub: 'user-1',
			role: 'USER',
			iss: 'finlytic-user-management',
			aud: 'finlytic',
			iat: now,
			exp: now + 900,
		});

	const signature = createSign('RSA-SHA256')
		.update(input)
		.sign(privateKey)
		.toString('base64url');

	return `${input}.${signature}`;
}

describe('gateway end to end', () => {
	const userLog: Received[] = [];
	const emailLog: Received[] = [];
	const userStub = stubUpstream('user-management', userLog);
	const emailStub = stubUpstream('email-ingestion', emailLog);

	let gateway: Server;
	let base = '';
	let auth: Record<string, string> = {};

	before(async () => {
		const userPort = await listen(userStub);
		const emailPort = await listen(emailStub);

		const config: GatewayConfig = {
			port: 0,
			publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
			issuer: 'finlytic-user-management',
			audience: 'finlytic',
			userManagementUrl: `http://127.0.0.1:${userPort}`,
			emailIngestionUrl: `http://127.0.0.1:${emailPort}`,
		};

		gateway = createGatewayServer(config);
		base = `http://127.0.0.1:${await listen(gateway)}`;
		auth = { authorization: `Bearer ${validToken()}` };
	});

	after(async () => {
		await close(gateway);
		await close(userStub);
		await close(emailStub);
	});

	it('answers /health itself rather than proxying it', async () => {
		const response = await fetch(`${base}/health`);
		const body = (await response.json()) as { service: string };

		assert.equal(body.service, 'gateway');
	});

	it('routes /users to user-management', async () => {
		const response = await fetch(`${base}/users/me`, { headers: auth });

		assert.equal(response.status, 200);
		assert.equal(response.headers.get('x-upstream'), 'user-management');
		assert.equal(userLog.at(-1)?.url, '/users/me');
	});

	it('routes /accounts to the OTHER upstream', async () => {
		const response = await fetch(`${base}/accounts`, { headers: auth });

		assert.equal(response.headers.get('x-upstream'), 'email-ingestion');
		assert.equal(emailLog.at(-1)?.url, '/accounts');
	});

	it('rejects an unauthenticated protected route without contacting the upstream', async () => {
		const before = userLog.length;
		const response = await fetch(`${base}/users/me`);

		assert.equal(response.status, 401);
		// The upstream never saw the request.
		assert.equal(userLog.length, before);
	});

	it('streams a request body through without parsing it', async () => {
		const payload = JSON.stringify({ email: 'a@b.com', password: 'secret' });

		const response = await fetch(`${base}/auth/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: payload,
		});

		assert.equal(response.status, 200);
		assert.equal(userLog.at(-1)?.method, 'POST');
		assert.equal(userLog.at(-1)?.body, payload);
	});

	it('rate limits repeated logins without forwarding them', async () => {
		const before = userLog.length;
		let last: Response | undefined;

		// The login rule allows 5 a minute and an earlier test already spent one,
		// so loop until the limiter answers rather than assuming a count.
		for (let attempt = 0; attempt < 8; attempt += 1) {
			last = await fetch(`${base}/auth/login`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}',
			});

			if (last.status === 429) {
				break;
			}
		}

		assert.equal(last?.status, 429);
		assert.ok(Number(last?.headers.get('retry-after')) > 0);
		// Whatever got through stopped at the limit; the rest never reached it.
		assert.ok(userLog.length - before <= 5);
	});

	it('lets the OAuth callback through with no token, query string intact', async () => {
		const response = await fetch(
			`${base}/oauth/gmail/callback?code=abc&state=xyz`,
		);

		// The provider's redirect carries no Authorization header.
		assert.equal(response.status, 200);
		assert.equal(
			emailLog.at(-1)?.url,
			'/oauth/gmail/callback?code=abc&state=xyz',
		);
	});

	it('forwards the token and replaces Host with the upstream', async () => {
		await fetch(`${base}/users/me`, { headers: auth });
		const received = userLog.at(-1);

		// The service verifies independently, so the header must survive the hop.
		assert.equal(received?.headers.authorization, auth.authorization);
		// Host is the upstream's, not the gateway's.
		assert.notEqual(received?.headers.host, new URL(base).host);
	});

	it('overwrites a client-supplied x-forwarded-for', async () => {
		await fetch(`${base}/users/me`, {
			headers: { ...auth, 'x-forwarded-for': '203.0.113.9' },
		});

		// Trusting this header would let any caller dictate what the upstream
		// logs as the client address.
		assert.notEqual(userLog.at(-1)?.headers['x-forwarded-for'], '203.0.113.9');
	});

	it('404s an unknown path without contacting either upstream', async () => {
		const before = userLog.length + emailLog.length;
		const response = await fetch(`${base}/nope`, { headers: auth });

		assert.equal(response.status, 404);
		assert.equal(userLog.length + emailLog.length, before);
	});

	it('mints a request id and ignores a caller-supplied one', async () => {
		const response = await fetch(`${base}/users/me`, {
			headers: { ...auth, 'x-request-id': 'client-controlled' },
		});

		const forwarded = userLog.at(-1)?.headers['x-request-id'];

		assert.notEqual(forwarded, 'client-controlled');
		assert.equal(response.headers.get('x-request-id'), forwarded);
	});

	it('returns 502 when the upstream is unreachable', async () => {
		// Runs last: it closes a stub the other tests depend on.
		await close(emailStub);

		const response = await fetch(`${base}/accounts`, { headers: auth });
		const body = (await response.json()) as { statusCode: number };

		assert.equal(response.status, 502);
		assert.equal(body.statusCode, 502);
	});
});
