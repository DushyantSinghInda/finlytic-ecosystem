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
		// /oauth/:provider/callback arrives as a browser redirect from Google or
		// Zoho with no Authorization header, so this prefix cannot require one.
		// email-ingestion guards /authorize itself.
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
