import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import { json } from './http.ts';
import { TokenError, verifyAccessToken } from './jwt.ts';
import { buildRoutes, matchRoute } from './routes.ts';
import { proxy } from './proxy.ts';
import type { GatewayConfig } from './config.ts';
import { createRateLimiter, WINDOW_MS } from './rate-limit.ts';

function bearerToken(req: IncomingMessage): string | null {
	const header = req.headers.authorization;

	if (!header?.startsWith('Bearer ')) {
		return null;
	}

	return header.slice('Bearer '.length).trim() || null;
}

export function createGatewayServer(config: GatewayConfig): Server {
	const routes = buildRoutes(config);

	const limiter = createRateLimiter();

	// unref: a bare interval keeps the event loop alive, which would stop the
	// test runner exiting and make docker stop wait for the timer.
	setInterval(() => limiter.prune(), WINDOW_MS).unref();

	return createServer((req, res) => {
		if (req.method === 'GET' && req.url === '/health') {
			json(res, 200, { status: 'ok', service: 'gateway' });
			return;
		}

		const pathname = new URL(req.url ?? '/', 'http://gateway.invalid').pathname;

		// The socket address, never x-forwarded-for: this is the edge, so that
		// header is caller-controlled and would let anyone reset their counter.
		const client = req.socket.remoteAddress ?? 'unknown';
		const decision = limiter.check(client, req.method ?? 'GET', pathname);

		if (!decision.allowed) {
			console.warn(
				`[gateway] 429 ${req.method ?? 'GET'} ${pathname} from ${client}`,
			);

			json(
				res,
				429,
				{ statusCode: 429, message: 'Too many requests' },
				{ 'retry-after': String(decision.retryAfterSeconds) },
			);
			return;
		}

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
