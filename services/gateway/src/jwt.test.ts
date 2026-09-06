import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createSign, generateKeyPairSync } from 'node:crypto';
import { TokenError, verifyAccessToken } from './jwt.ts';
import type { GatewayConfig } from './config.ts';

// Generated here, so the suite needs no fixtures and no running stack. Holding
// the private half is what lets it forge the tokens an attacker would send.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
});

const config: GatewayConfig = {
	port: 3000,
	publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
	issuer: 'finlytic-user-management',
	audience: 'finlytic',
	userManagementUrl: 'http://127.0.0.1:3001',
	emailIngestionUrl: 'http://127.0.0.1:3002',
};

function segment(value: object): string {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function claims(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	const now = Math.floor(Date.now() / 1000);

	return {
		sub: 'user-1',
		role: 'USER',
		iss: 'finlytic-user-management',
		aud: 'finlytic',
		iat: now,
		exp: now + 900,
		...overrides,
	};
}

function signRs256(payload: Record<string, unknown>, key = privateKey): string {
	const input = `${segment({ alg: 'RS256', typ: 'JWT' })}.${segment(payload)}`;
	const signature = createSign('RSA-SHA256')
		.update(input)
		.sign(key)
		.toString('base64url');

	return `${input}.${signature}`;
}

describe('verifyAccessToken', () => {
	it('accepts a token signed by the matching key', () => {
		const user = verifyAccessToken(signRs256(claims()), config);

		assert.deepEqual(user, { id: 'user-1', role: 'USER' });
	});

	it('rejects a payload swapped under a valid signature', () => {
		const [header, , signature] = signRs256(claims()).split('.');
		// Privilege escalation: same signature, USER -> ADMIN.
		const forged = `${header}.${segment(claims({ role: 'ADMIN' }))}.${signature}`;

		assert.throws(() => verifyAccessToken(forged, config), TokenError);
	});

	it('rejects alg:none with an empty signature', () => {
		const forged = `${segment({ alg: 'none', typ: 'JWT' })}.${segment(claims())}.`;

		// Without the alg pin this token authenticates as anyone.
		assert.throws(() => verifyAccessToken(forged, config), TokenError);
	});

	it('rejects HS256 signed with the public key as the HMAC secret', () => {
		const input = `${segment({ alg: 'HS256', typ: 'JWT' })}.${segment(claims())}`;
		const signature = createHmac('sha256', config.publicKey)
			.update(input)
			.digest('base64url');

		// Algorithm confusion: the HMAC secret here is the public key, which
		// anyone can read.
		assert.throws(
			() => verifyAccessToken(`${input}.${signature}`, config),
			TokenError,
		);
	});

	it('rejects a token signed by a different key pair', () => {
		const other = generateKeyPairSync('rsa', { modulusLength: 2048 });

		assert.throws(
			() => verifyAccessToken(signRs256(claims(), other.privateKey), config),
			TokenError,
		);
	});

	it('rejects an expired token', () => {
		const now = Math.floor(Date.now() / 1000);

		assert.throws(
			() => verifyAccessToken(signRs256(claims({ exp: now - 1 })), config),
			TokenError,
		);
	});

	it('rejects a foreign issuer', () => {
		assert.throws(
			() =>
				verifyAccessToken(signRs256(claims({ iss: 'someone-else' })), config),
			TokenError,
		);
	});

	it('rejects a token minted for another audience', () => {
		assert.throws(
			() =>
				verifyAccessToken(signRs256(claims({ aud: 'another-app' })), config),
			TokenError,
		);
	});

	it('rejects a token with no sub or role', () => {
		assert.throws(
			() =>
				verifyAccessToken(
					signRs256({
						iss: config.issuer,
						aud: config.audience,
						exp: Math.floor(Date.now() / 1000) + 900,
					}),
					config,
				),
			TokenError,
		);
	});

	it('rejects anything that is not three segments', () => {
		assert.throws(() => verifyAccessToken('not.a-token', config), TokenError);
	});
});
