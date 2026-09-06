import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, ruleFor, WINDOW_MS } from './rate-limit.ts';

const client = '203.0.113.7';

describe('ruleFor', () => {
	it('matches the login rule only on POST', () => {
		assert.equal(ruleFor('POST', '/auth/login').max, 5);
		// A GET is not a login attempt; it falls through to the default.
		assert.equal(ruleFor('GET', '/auth/login').max, 100);
	});

	it('matches account actions regardless of the id in the path', () => {
		assert.equal(ruleFor('POST', '/accounts/abc/sync').id, 'account-actions');
		assert.equal(
			ruleFor('POST', '/accounts/def/preview').id,
			'account-actions',
		);
	});

	it('falls back to the default rule', () => {
		assert.equal(ruleFor('GET', '/users/me').id, 'default');
		assert.equal(ruleFor('GET', '/anything').max, 100);
	});
});

describe('createRateLimiter', () => {
	it('allows exactly the limit and rejects the next request', () => {
		const limiter = createRateLimiter();

		for (let attempt = 1; attempt <= 5; attempt += 1) {
			assert.equal(
				limiter.check(client, 'POST', '/auth/login', 1000).allowed,
				true,
			);
		}

		const denied = limiter.check(client, 'POST', '/auth/login', 1000);

		assert.equal(denied.allowed, false);
		assert.equal(denied.remaining, 0);
	});

	it('reports how long is left in the window', () => {
		const limiter = createRateLimiter();

		for (let attempt = 1; attempt <= 6; attempt += 1) {
			limiter.check(client, 'POST', '/auth/login', 1000);
		}

		// 10s into a 60s window, so 50s remain.
		const denied = limiter.check(client, 'POST', '/auth/login', 11_000);

		assert.equal(denied.allowed, false);
		assert.equal(denied.retryAfterSeconds, 50);
	});

	it('starts a fresh window once the old one has passed', () => {
		const limiter = createRateLimiter();

		for (let attempt = 1; attempt <= 6; attempt += 1) {
			limiter.check(client, 'POST', '/auth/login', 1000);
		}

		assert.equal(
			limiter.check(client, 'POST', '/auth/login', 1000 + WINDOW_MS).allowed,
			true,
		);
	});

	it('counts each client separately', () => {
		const limiter = createRateLimiter();

		for (let attempt = 1; attempt <= 6; attempt += 1) {
			limiter.check(client, 'POST', '/auth/login', 1000);
		}

		assert.equal(
			limiter.check('198.51.100.4', 'POST', '/auth/login', 1000).allowed,
			true,
		);
	});

	it('keeps rules in separate buckets', () => {
		const limiter = createRateLimiter();

		for (let attempt = 1; attempt <= 6; attempt += 1) {
			limiter.check(client, 'POST', '/auth/login', 1000);
		}

		// Exhausting login must not lock a caller out of registering.
		assert.equal(
			limiter.check(client, 'POST', '/auth/register', 1000).allowed,
			true,
		);
	});

	it('shares one bucket across paths matching the same rule', () => {
		const limiter = createRateLimiter();

		for (let attempt = 1; attempt <= 10; attempt += 1) {
			limiter.check(client, 'POST', `/accounts/account-${attempt}/sync`, 1000);
		}

		// Otherwise the limit would be per account rather than per client.
		assert.equal(
			limiter.check(client, 'POST', '/accounts/another/sync', 1000).allowed,
			false,
		);
	});

	it('drops counters whose window has passed', () => {
		const limiter = createRateLimiter();

		limiter.check(client, 'POST', '/auth/login', 1000);
		limiter.check('198.51.100.4', 'POST', '/auth/login', 1000);
		assert.equal(limiter.size(), 2);

		limiter.prune(1000 + WINDOW_MS);
		assert.equal(limiter.size(), 0);
	});
});
