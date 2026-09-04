import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../crypto/encryption.service';
import { MailProviderRegistry } from '../mail/mail-provider.registry';
import { AccountStatus } from '../generated/prisma/client';
import type { MailAccount } from '../generated/prisma/client';
import type {
	ProviderConnection,
	ProviderMetadata,
} from '../mail/providers/mail-provider.interface';

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
				accessToken: this.encryption.decrypt(account.accessTokenEnc),
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

		try {
			const tokens = await adapter.refreshAccessToken(
				this.encryption.decrypt(account.refreshTokenEnc),
				metadata,
			);

			await this.prisma.mailAccount.update({
				where: { id: account.id },
				data: {
					accessTokenEnc: this.encryption.encrypt(tokens.accessToken),
					accessTokenExpires: tokens.expiresAt,
					status: AccountStatus.ACTIVE,
					lastSyncError: null,
					...(tokens.refreshToken
						? { refreshTokenEnc: this.encryption.encrypt(tokens.refreshToken) }
						: {}),
				},
			});

			this.logger.log(`Refreshed access token for account ${account.id}`);

			return tokens.accessToken;
		} catch (error) {
			if (error instanceof UnauthorizedException) {
				throw error;
			}

			await this.markReauthRequired(
				account.id,
				'Provider rejected the refresh token',
			);
			throw new UnauthorizedException('Account requires reconnection');
		}
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
