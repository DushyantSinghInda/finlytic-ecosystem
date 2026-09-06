import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from './config.ts';
import { TokenError, verifyAccessToken } from './jwt.ts';
import { json } from './http.ts';
import { proxy } from './proxy.ts';
import { buildRoutes, matchRoute } from './routes.ts';

const config = loadConfig();

function bearerToken(req: IncomingMessage): string | null {
	const header = req.headers.authorization;

	if (!header?.startsWith('Bearer ')) {
		return null;
	}

	return header.slice('Bearer '.length).trim() || null;
}

function handle(req: IncomingMessage, res: ServerResponse): void {
	// Deliberately not a router yet. Everything except /health becomes a proxied
	// route in step 3, so a table of paths here would be thrown away.
	if (req.method === 'GET' && req.url === '/health') {
		json(res, 200, { status: 'ok', service: 'gateway' });
		return;
	}

	if (req.method === 'GET' && req.url === '/whoami') {
		const token = bearerToken(req);

		if (!token) {
			json(res, 401, { statusCode: 401, message: 'Missing bearer token' });
			return;
		}

		try {
			json(res, 200, verifyAccessToken(token, config));
		} catch (error) {
			// Detail to the log, one generic message to the caller. Telling a
			// caller WHICH check failed tells an attacker which knob to turn.
			console.warn(`[gateway] token rejected: ${(error as Error).message}`);
			json(res, 401, { statusCode: 401, message: 'Invalid token' });
		}

		return;
	}

	const pathname = new URL(req.url ?? '/', 'http://gateway.invalid').pathname;

	const routes = buildRoutes(config);
	const route = matchRoute(routes, pathname);

	if (!route) {
		json(res, 404, { statusCode: 404, message: 'Not found' });
		return;
	}

	if (route.requiresAuth) {
		const token = bearerToken(req);

		try {
			if (!token) {
				throw new TokenError('Missing bearer token');
			}

			verifyAccessToken(token, config);
		} catch (error) {
			// Rejected here, so the upstream never sees it. The Authorization
			// header is still forwarded on success — the service verifies again,
			// independently. This check is defence in depth, not the control.
			console.warn(`[gateway] 401 ${pathname}: ${(error as Error).message}`);
			json(res, 401, { statusCode: 401, message: 'Invalid token' });
			return;
		}
	}

	proxy(req, res, route.target);
}

const server = createServer(handle);

server.listen(config.port, () => {
	console.log(`[gateway] listening on http://127.0.0.1:${config.port}`);
});

// Nest does this for you. Without it, docker stop waits the full 10s timeout
// and then kills the process, which looks like a hang rather than a shutdown.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		console.log(`[gateway] ${signal} received, closing`);
		server.close(() => process.exit(0));
	});
}
