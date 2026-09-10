import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EncryptionService } from '../crypto/encryption.service.js';
import { MailProviderRegistry } from '../mail/mail-provider.registry.js';
import { AccountStatus } from '../generated/prisma/client.js';
import type { MailAccount } from '../generated/prisma/client.js';
import type {
	OAuthTokens,
	ProviderConnection,
	ProviderMetadata,
} from '../mail/providers/mail-provider.interface.js';
import { ProviderAuthRevokedError } from '../mail/providers/mail-provider.interface.js';

const REFRESH_SKEW_MS = 5 * 60 * 1000;

@Injectable()
export class AccountTokenService {
	private readonly logger = new Logger(AccountTokenService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService,
		private readonly registry: MailProviderRegistry,
	) {}

	async getConnection(account: MailAccount): Promise<ProviderConnection> {
		const metadata = (account.providerMetadata ?? {}) as ProviderMetadata;
		const remainingMs = account.accessTokenExpires.getTime() - Date.now();

		if (remainingMs > REFRESH_SKEW_MS) {
			return {
				accessToken: this.encryption.decrypt(account.accessTokenEnc, 'access'),
				providerAccountId: account.providerAccountId,
				metadata,
			};
		}

		return {
			accessToken: await this.refresh(account, metadata),
			providerAccountId: account.providerAccountId,
			metadata,
		};
	}

	private async refresh(
		account: MailAccount,
		metadata: ProviderMetadata,
	): Promise<string> {
		if (!account.refreshTokenEnc) {
			await this.markReauthRequired(account.id, 'No refresh token stored');
			throw new UnauthorizedException('Account requires reconnection');
		}

		const adapter = this.registry.get(account.provider);

		let tokens: OAuthTokens;

		try {
			tokens = await adapter.refreshAccessToken(
				this.encryption.decrypt(account.refreshTokenEnc, 'refresh'),
				metadata,
			);
		} catch (error) {
			// Only a grant the provider says is gone disables the account. A 5xx,
			// a timeout or a DNS blip used to land here too and mark the mailbox
			// REAUTH_REQUIRED — which the scheduler filters out, so nothing ever
			// re-queued it. A bad minute at Google became a permanent outage that
			// only a manual reconnect could clear.
			if (error instanceof ProviderAuthRevokedError) {
				await this.markReauthRequired(account.id, error.message);
				throw new UnauthorizedException('Account requires reconnection');
			}

			// Left ACTIVE and rethrown so BullMQ's retry/backoff can do its job.
			this.logger.warn(
				`Token refresh for account ${account.id} failed transiently: ${
					error instanceof Error ? error.message : 'unknown'
				}`,
			);
			throw error;
		}

		// Outside the catch on purpose: a failure to persist a token we did
		// successfully obtain is a database problem, not a revoked grant, and
		// must not disconnect the account.
		await this.prisma.mailAccount.update({
			where: { id: account.id },
			data: {
				accessTokenEnc: this.encryption.encrypt(tokens.accessToken, 'access'),
				accessTokenExpires: tokens.expiresAt,
				status: AccountStatus.ACTIVE,
				lastSyncError: null,
				...(tokens.refreshToken
					? {
							refreshTokenEnc: this.encryption.encrypt(
								tokens.refreshToken,
								'refresh',
							),
						}
					: {}),
			},
		});

		this.logger.log(`Refreshed access token for account ${account.id}`);

		return tokens.accessToken;
	}

	private async markReauthRequired(
		accountId: string,
		reason: string,
	): Promise<void> {
		await this.prisma.mailAccount.update({
			where: { id: accountId },
			data: { status: AccountStatus.REAUTH_REQUIRED, lastSyncError: reason },
		});

		this.logger.warn(`Account ${accountId} needs reconnection: ${reason}`);
	}
}
