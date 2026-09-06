import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import { json } from './http.ts';
import { TokenError, verifyAccessToken } from './jwt.ts';
import { buildRoutes, matchRoute } from './routes.ts';
import { proxy } from './proxy.ts';
import type { GatewayConfig } from './config.ts';

function bearerToken(req: IncomingMessage): string | null {
	const header = req.headers.authorization;

	if (!header?.startsWith('Bearer ')) {
		return null;
	}

	return header.slice('Bearer '.length).trim() || null;
}

export function createGatewayServer(config: GatewayConfig): Server {
	const routes = buildRoutes(config);

	return createServer((req, res) => {
		if (req.method === 'GET' && req.url === '/health') {
			json(res, 200, { status: 'ok', service: 'gateway' });
			return;
		}

		const pathname = new URL(req.url ?? '/', 'http://gateway.invalid').pathname;
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
				// Rejected here so the upstream is never asked. On success the
				// Authorization header is still forwarded and the service verifies
				// it again: this check is defence in depth, not the control.
				console.warn(`[gateway] 401 ${pathname}: ${(error as Error).message}`);
				json(res, 401, { statusCode: 401, message: 'Invalid token' });
				return;
			}
		}

		proxy(req, res, route.target);
	});
}
