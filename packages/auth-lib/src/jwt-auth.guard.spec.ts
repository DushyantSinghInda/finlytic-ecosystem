import { jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { AccessTokenPayload } from './types.js';

/**
 * This guard is the authentication of every service in the ecosystem, and it
 * is the one place a bad request arrives as raw, unvalidated input. It had no
 * tests until a headerless request was found to answer 500 instead of 401.
 */
function contextFor(headers: Record<string, string>): {
	context: ExecutionContext;
	request: Request;
} {
	const request = { headers } as unknown as Request;

	const context = {
		switchToHttp: () => ({ getRequest: () => request }),
	} as unknown as ExecutionContext;

	return { context, request };
}

const VALID_PAYLOAD: AccessTokenPayload = {
	sub: 'user-1',
	role: 'USER',
	iss: 'finlytic',
	aud: 'finlytic-services',
	iat: 1_700_000_000,
	exp: 1_700_000_900,
};

describe('JwtAuthGuard', () => {
	const verifyAsync = jest.fn<(token: string) => Promise<AccessTokenPayload>>();
	const jwtService = { verifyAsync } as unknown as JwtService;
	const guard = new JwtAuthGuard(jwtService);

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('rejects without reaching verification', () => {
		it('when there is no Authorization header at all', async () => {
			// The regression this suite exists for. Destructuring an absent header
			// leaves the scheme undefined, and calling .toLowerCase() on it threw a
			// TypeError *outside* the try below — surfacing as 500, not 401.
			// Reachable in production: /oauth/:provider/authorize is the one guarded
			// route the gateway deliberately does not pre-check.
			const { context } = contextFor({});

			await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
				UnauthorizedException,
			);
			expect(verifyAsync).not.toHaveBeenCalled();
		});

		it('when the header is empty', async () => {
			const { context } = contextFor({ authorization: '' });

			await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
				UnauthorizedException,
			);
			expect(verifyAsync).not.toHaveBeenCalled();
		});

		it('when the scheme is not Bearer', async () => {
			// Basic auth against a JWT endpoint is a misconfigured client, not a
			// caller to hand a token-shaped error to.
			const { context } = contextFor({ authorization: 'Basic dXNlcjpwYXNz' });

			await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
				UnauthorizedException,
			);
			expect(verifyAsync).not.toHaveBeenCalled();
		});

		it('when Bearer carries no value', async () => {
			const { context } = contextFor({ authorization: 'Bearer' });

			await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
				UnauthorizedException,
			);
			expect(verifyAsync).not.toHaveBeenCalled();
		});
	});

	it('accepts a lowercase bearer scheme', async () => {
		// RFC 7235 says the scheme is case-insensitive, and real clients send
		// every casing.
		verifyAsync.mockResolvedValue(VALID_PAYLOAD);
		const { context } = contextFor({ authorization: 'bearer token-1' });

		await expect(guard.canActivate(context)).resolves.toBe(true);
		expect(verifyAsync).toHaveBeenCalledWith('token-1');
	});

	it('rejects a token the JwtService refuses', async () => {
		// Expiry, a bad signature, the wrong issuer — all of it is decided by
		// verifyOptions, and all of it must land as 401 rather than escaping.
		verifyAsync.mockRejectedValue(new Error('jwt expired'));
		const { context, request } = contextFor({ authorization: 'Bearer stale' });

		await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
			UnauthorizedException,
		);
		expect(request.user).toBeUndefined();
	});

	it('attaches exactly id and role on success', async () => {
		verifyAsync.mockResolvedValue({
			...VALID_PAYLOAD,
			// A claim the guard must not pass on even if a future token carries it.
			email: 'someone@example.com',
		} as AccessTokenPayload);

		const { context, request } = contextFor({ authorization: 'Bearer good' });

		await expect(guard.canActivate(context)).resolves.toBe(true);
		// Rule 4 in the other direction: nothing but ids and roles crosses into
		// application code, whatever the token happens to contain.
		expect(request.user).toEqual({ id: 'user-1', role: 'USER' });
	});
});
