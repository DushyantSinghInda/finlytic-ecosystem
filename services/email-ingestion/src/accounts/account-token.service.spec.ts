import { jest } from '@jest/globals';
import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import { AccountTokenService } from './account-token.service.js';
import { ProviderAuthRevokedError } from '../mail/providers/mail-provider.interface.js';
import type { OAuthTokens } from '../mail/providers/mail-provider.interface.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EncryptionService } from '../crypto/encryption.service.js';
import type { MailProviderRegistry } from '../mail/mail-provider.registry.js';
import type { MailAccount } from '../generated/prisma/client.js';

function accountAt(expiresInMs: number): MailAccount {
	return {
		id: 'acc-1',
		provider: 'GMAIL',
		providerAccountId: 'google-1',
		accessTokenEnc: 'enc(access)',
		refreshTokenEnc: 'enc(refresh)',
		accessTokenExpires: new Date(Date.now() + expiresInMs),
		providerMetadata: null,
		status: 'ACTIVE',
	} as unknown as MailAccount;
}

const FRESH_TOKENS: OAuthTokens = {
	accessToken: 'new-access',
	refreshToken: 'new-refresh',
	expiresAt: new Date(Date.now() + 3_600_000),
	scopes: [],
};

describe('AccountTokenService', () => {
	const update = jest.fn<(args: unknown) => Promise<unknown>>();
	const refreshAccessToken =
		jest.fn<(token: string, meta: unknown) => Promise<OAuthTokens>>();

	const prisma = { mailAccount: { update } } as unknown as PrismaService;
	const encryption = {
		decrypt: (value: string) => `dec(${value})`,
		encrypt: (value: string) => `enc(${value})`,
	} as unknown as EncryptionService;
	const registry = {
		get: () => ({ refreshAccessToken }),
	} as unknown as MailProviderRegistry;

	const service = new AccountTokenService(prisma, encryption, registry);

	beforeEach(() => {
		jest.clearAllMocks();
		update.mockResolvedValue({});
	});

	it('uses the stored token while it is comfortably valid', async () => {
		const connection = await service.getConnection(accountAt(30 * 60_000));

		expect(connection.accessToken).toBe('dec(enc(access))');
		expect(refreshAccessToken).not.toHaveBeenCalled();
	});

	it('refreshes inside the five-minute skew window', async () => {
		// Refreshing early rather than on expiry covers clock skew between us and
		// the provider, and requests already in flight when the token turns over.
		refreshAccessToken.mockResolvedValue(FRESH_TOKENS);

		const connection = await service.getConnection(accountAt(60_000));

		expect(refreshAccessToken).toHaveBeenCalledTimes(1);
		expect(connection.accessToken).toBe('new-access');
	});

	describe('when the refresh fails', () => {
		it('disconnects the account only when the provider says the grant is gone', async () => {
			refreshAccessToken.mockRejectedValue(
				new ProviderAuthRevokedError('Google', 'invalid_grant'),
			);

			await expect(
				service.getConnection(accountAt(60_000)),
			).rejects.toBeInstanceOf(UnauthorizedException);

			const written = update.mock.calls[0]?.[0] as {
				data: { status: string };
			};
			expect(written.data.status).toBe('REAUTH_REQUIRED');
		});

		it('leaves the account ACTIVE when the failure is transient', async () => {
			// The bug this pins down: every failure used to mark the account
			// REAUTH_REQUIRED, and the scheduler only polls ACTIVE accounts — so a
			// 503 from Google silently ended that mailbox's syncing forever, until
			// somebody reconnected it by hand.
			refreshAccessToken.mockRejectedValue(
				new BadGatewayException('Could not complete Google authorization'),
			);

			await expect(service.getConnection(accountAt(60_000))).rejects.toThrow(
				'Could not complete Google authorization',
			);

			// Nothing written at all: the status must survive so the scheduler
			// re-queues it and BullMQ's backoff gets its turn.
			expect(update).not.toHaveBeenCalled();
		});

		it('rethrows the transient error rather than masking it as an auth problem', async () => {
			refreshAccessToken.mockRejectedValue(new Error('ETIMEDOUT'));

			// An UnauthorizedException here would tell the operator to reconnect
			// the mailbox when the real answer is "the network was down".
			await expect(
				service.getConnection(accountAt(60_000)),
			).rejects.not.toBeInstanceOf(UnauthorizedException);
		});

		it('disconnects when there is no refresh token to use', async () => {
			const account = accountAt(60_000);
			(account as { refreshTokenEnc: string | null }).refreshTokenEnc = null;

			await expect(service.getConnection(account)).rejects.toBeInstanceOf(
				UnauthorizedException,
			);

			const written = update.mock.calls[0]?.[0] as {
				data: { status: string };
			};
			expect(written.data.status).toBe('REAUTH_REQUIRED');
		});
	});

	it('does not disconnect the account when persisting a good token fails', async () => {
		// The refresh succeeded — the provider is fine and the grant is valid.
		// A database failure at this point is our problem, not the user's, and
		// must not cost them a reconnect.
		refreshAccessToken.mockResolvedValue(FRESH_TOKENS);
		update.mockRejectedValue(new Error('connection terminated'));

		await expect(service.getConnection(accountAt(60_000))).rejects.toThrow(
			'connection terminated',
		);

		const statuses = update.mock.calls.map(
			(call) => (call[0] as { data: { status?: string } }).data.status,
		);
		expect(statuses).not.toContain('REAUTH_REQUIRED');
	});
});
