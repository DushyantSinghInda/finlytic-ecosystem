import type { GatewayConfig } from './config.ts';

export interface Route {
	prefix: string;
	target: string;
	requiresAuth: boolean;
	/** Removed before forwarding — services don't know about /api. */
	stripPrefix?: string;
}

export function buildRoutes(config: GatewayConfig): Route[] {
	return [
		{
			prefix: '/api/auth',
			target: config.userManagementUrl,
			requiresAuth: false,
			stripPrefix: '/api',
		},
		{
			prefix: '/api/users',
			target: config.userManagementUrl,
			requiresAuth: true,
			stripPrefix: '/api',
		},
		{
			prefix: '/api/accounts',
			target: config.emailIngestionUrl,
			requiresAuth: true,
			stripPrefix: '/api',
		},
		// Unprefixed: this is where Google and Zoho redirect the browser, and
		// those URIs are registered in their consoles. Never a client route.
		{ prefix: '/oauth', target: config.emailIngestionUrl, requiresAuth: false },
	];
}

export function matchRoute(
	routes: Route[],
	pathname: string,
): Route | undefined {
	// Exact segment boundary, so /authorization does not match the /auth route.
	return routes.find(
		(route) =>
			pathname === route.prefix || pathname.startsWith(`${route.prefix}/`),
	);
}
