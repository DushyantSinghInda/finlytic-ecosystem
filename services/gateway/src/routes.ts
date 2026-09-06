import type { GatewayConfig } from './config.ts';

export interface Route {
	prefix: string;
	target: string;
	requiresAuth: boolean;
}

export function buildRoutes(config: GatewayConfig): Route[] {
	return [
		{ prefix: '/auth', target: config.userManagementUrl, requiresAuth: false },
		{ prefix: '/users', target: config.userManagementUrl, requiresAuth: true },
		{
			prefix: '/accounts',
			target: config.emailIngestionUrl,
			requiresAuth: true,
		},
		// Public on purpose: /oauth/:provider/callback is a browser redirect from
		// Google or Zoho and carries no Authorization header. The service guards
		// /authorize itself — the edge does not duplicate route-level policy.
		{ prefix: '/oauth', target: config.emailIngestionUrl, requiresAuth: false },
	];
}

export function matchRoute(
	routes: Route[],
	pathname: string,
): Route | undefined {
	// Boundary matters: /authorization must NOT match the /auth route.
	return routes.find(
		(route) =>
			pathname === route.prefix || pathname.startsWith(`${route.prefix}/`),
	);
}
