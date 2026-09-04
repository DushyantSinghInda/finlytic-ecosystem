import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../crypto/encryption.service';
import { AccountStatus, MailProvider } from '../generated/prisma/client';
import type { MailAccount } from '../generated/prisma/client';
import type { ConnectResult } from '../mail/providers/mail-provider.interface';
import { MailProviderRegistry } from '../mail/mail-provider.registry';
import { AccountTokenService } from './account-token.service';
import { SyncQueueService } from '../queue/sync-queue.service';

@Injectable()
export class AccountsService {
	private readonly logger = new Logger(AccountsService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService,
		private readonly accountTokens: AccountTokenService,
		private readonly registry: MailProviderRegistry,
		private readonly syncQueue: SyncQueueService,
	) { }

	async connect(
		userId: string,
		provider: MailProvider,
		{ tokens, identity }: ConnectResult,
	): Promise<MailAccount> {
		const adapter = this.registry.get(provider);
		const missing = adapter.requiredScopes.filter(
			(scope) => !tokens.scopes.includes(scope),
		);

		// Throw BEFORE the upsert — a partial grant must not overwrite a working account.
		if (missing.length) {
			this.logger.warn(
				`User ${userId} completed ${provider} consent without: ${missing.join(', ')}`,
			);

			throw new ForbiddenException(
				`Consent incomplete — missing ${missing.join(', ')}. Reconnect and approve every permission.`,
			);
		}
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

	async preview(userId: string, accountId: string) {
		const account = await this.prisma.mailAccount.findFirst({
			where: { id: accountId, userId },
		});

		if (!account) {
			throw new NotFoundException('Account not found');
		}

		const accessToken = await this.accountTokens.getAccessToken(account);
		const adapter = this.registry.get(account.provider);

		const profile = await adapter.getProfile(accessToken);
		const page = await adapter.listMessageIds(accessToken, { maxResults: 5 });

		const first = page.messageIds.length
			? await adapter.fetchRawMessage(accessToken, page.messageIds[0])
			: null;

		return {
			emailAddress: profile.emailAddress,
			cursor: profile.cursor,
			idsReturned: page.messageIds.length,
			hasMorePages: Boolean(page.nextPageToken),
			firstMessage: first && {
				id: first.providerMessageId,
				sentAt: first.internalDate,
				labels: first.labels,
				sizeBytes: first.sizeBytes,
				rawBytes: first.raw.length,
				headerPreview: first.raw.subarray(0, 300).toString('utf8'),
			},
		};
	}

	async requestSync(userId: string, accountId: string) {
		const account = await this.prisma.mailAccount.findFirst({
			where: { id: accountId, userId },
			select: { id: true, status: true },
		});

		if (!account) {
			throw new NotFoundException('Account not found');
		}

		const { jobId, alreadyQueued } = await this.syncQueue.enqueueAccountSync(
			account.id,
			'manual',
		);

		return { accepted: true, jobId, alreadyQueued, status: account.status };
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
