import { randomBytes } from 'node:crypto';
import { OAuthStateService } from './oauth-state.service';
import type { ConfigService } from '@nestjs/config';

function buildService(secret = randomBytes(32).toString('base64')) {
	return new OAuthStateService({
		get: () => secret,
	} as unknown as ConfigService);
}

describe('OAuthStateService', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it('round-trips the user id', () => {
		const service = buildService();

		expect(service.verify(service.issue('user-1'))).toBe('user-1');
	});

	it('rejects a payload swapped under a valid signature', () => {
		const service = buildService();
		const [, signature] = service.issue('user-1').split('.');

		const forged = Buffer.from(
			JSON.stringify({
				userId: 'attacker',
				nonce: 'x',
				exp: Math.floor(Date.now() / 1000) + 600,
			}),
		).toString('base64url');

		// The entire job of state: the callback arrives from the user's browser,
		// so the payload has to prove we issued it.
		expect(() => service.verify(`${forged}.${signature}`)).toThrow(
			'Invalid OAuth state',
		);
	});

	it('rejects a signature of the wrong length without crashing', () => {
		const service = buildService();
		const [payload] = service.issue('user-1').split('.');

		// timingSafeEqual THROWS on a length mismatch. The explicit length check
		// is what turns a 500 into a 401.
		expect(() => service.verify(`${payload}.abc`)).toThrow(
			'Invalid OAuth state',
		);
	});

	it('rejects a state signed with a different secret', () => {
		const state = buildService().issue('user-1');

		expect(() => buildService().verify(state)).toThrow('Invalid OAuth state');
	});

	it('rejects a state with no signature at all', () => {
		expect(() => buildService().verify('just-a-payload')).toThrow(
			'Malformed OAuth state',
		);
	});

	it('expires the state after 10 minutes', () => {
		jest.useFakeTimers().setSystemTime(new Date('2026-09-05T10:00:00Z'));

		const service = buildService();
		const state = service.issue('user-1');

		jest.setSystemTime(new Date('2026-09-05T10:09:59Z'));
		expect(service.verify(state)).toBe('user-1');

		jest.setSystemTime(new Date('2026-09-05T10:10:01Z'));
		expect(() => service.verify(state)).toThrow('OAuth state has expired');
	});
});
