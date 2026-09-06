import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoutes, matchRoute } from './routes.ts';
import type { GatewayConfig } from './config.ts';

const config = {
	userManagementUrl: 'http://user-management',
	emailIngestionUrl: 'http://email-ingestion',
} as GatewayConfig;

const routes = buildRoutes(config);

describe('matchRoute', () => {
	const cases = [
		{
			path: '/auth/login',
			target: config.userManagementUrl,
			requiresAuth: false,
		},
		{
			path: '/auth/refresh',
			target: config.userManagementUrl,
			requiresAuth: false,
		},
		{ path: '/users/me', target: config.userManagementUrl, requiresAuth: true },
		{ path: '/accounts', target: config.emailIngestionUrl, requiresAuth: true },
		{
			path: '/accounts/abc/sync',
			target: config.emailIngestionUrl,
			requiresAuth: true,
		},
		{
			path: '/oauth/gmail/authorize',
			target: config.emailIngestionUrl,
			requiresAuth: false,
		},
		{
			path: '/oauth/gmail/callback',
			target: config.emailIngestionUrl,
			requiresAuth: false,
		},
	];

	for (const testCase of cases) {
		it(`routes ${testCase.path}`, () => {
			const route = matchRoute(routes, testCase.path);

			assert.equal(route?.target, testCase.target);
			assert.equal(route?.requiresAuth, testCase.requiresAuth);
		});
	}

	it('keeps the OAuth callback public', () => {
		// Not a duplicate of the table above — this one states WHY. The callback
		// is a browser redirect from the provider with no Authorization header,
		// so requiring a token here breaks connecting a mailbox.
		assert.equal(
			matchRoute(routes, '/oauth/zoho/callback')?.requiresAuth,
			false,
		);
	});

	it('does not match on a prefix that is only a substring', () => {
		// /authorization must not fall into the /auth route.
		assert.equal(matchRoute(routes, '/authorization'), undefined);
	});

	it('leaves unknown paths and /health unrouted', () => {
		assert.equal(matchRoute(routes, '/health'), undefined);
		assert.equal(matchRoute(routes, '/nope'), undefined);
	});
});
