import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../crypto/encryption.service';
import { AccountStatus, MailProvider } from '../generated/prisma/client';
import type { MailAccount } from '../generated/prisma/client';
import type { ConnectResult } from '../mail/providers/mail-provider.interface';

@Injectable()
export class AccountsService {
	private readonly logger = new Logger(AccountsService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService,
	) {}

	async connect(
		userId: string,
		provider: MailProvider,
		{ tokens, identity }: ConnectResult,
	): Promise<MailAccount> {
		const accessTokenEnc = this.encryption.encrypt(tokens.accessToken);
		const refreshTokenEnc = tokens.refreshToken
			? this.encryption.encrypt(tokens.refreshToken)
			: undefined;

		const account = await this.prisma.mailAccount.upsert({
			where: {
				userId_provider_providerAccountId: {
					userId,
					provider,
					providerAccountId: identity.providerAccountId,
				},
			},
			create: {
				userId,
				provider,
				providerAccountId: identity.providerAccountId,
				emailAddress: identity.emailAddress,
				accessTokenEnc,
				accessTokenExpires: tokens.expiresAt,
				refreshTokenEnc,
				scopes: tokens.scopes,
			},
			update: {
				emailAddress: identity.emailAddress,
				accessTokenEnc,
				accessTokenExpires: tokens.expiresAt,
				scopes: tokens.scopes,
				status: AccountStatus.ACTIVE,
				lastSyncError: null,
				// Only overwrite when the provider actually issued a new one.
				...(refreshTokenEnc ? { refreshTokenEnc } : {}),
			},
		});

		this.logger.log(
			`Connected ${provider} account ${account.id} for user ${userId}`,
		);

		return account;
	}

	listForUser(userId: string) {
		return this.prisma.mailAccount.findMany({
			where: { userId },
			select: {
				id: true,
				provider: true,
				emailAddress: true,
				status: true,
				scopes: true,
				lastSyncedAt: true,
				createdAt: true,
			},
			orderBy: { createdAt: 'asc' },
		});
	}
}
