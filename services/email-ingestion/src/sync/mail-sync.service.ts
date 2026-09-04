import { Injectable, Logger } from '@nestjs/common';
import { AccountTokenService } from '../accounts/account-token.service';
import { MailProviderRegistry } from '../mail/mail-provider.registry';
import { MessageIngestionService } from '../messages/message-ingestion.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnrecoverableError } from 'bullmq';
import { AccountStatus } from '../generated/prisma/enums';
import type { MailProviderAdapter } from '../mail/providers/mail-provider.interface';
import type { MailAccount } from '../generated/prisma/client';

const INITIAL_BATCH = 50;
const MAX_IDS_PER_RUN = 200;

export interface SyncOutcome {
	accountId: string;
	mode: 'initial' | 'incremental';
	fetched: number;
	created: number;
	skipped: number;
	gone: number;
}

@Injectable()
export class MailSyncService {
	private readonly logger = new Logger(MailSyncService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly accountTokens: AccountTokenService,
		private readonly registry: MailProviderRegistry,
		private readonly ingestion: MessageIngestionService,
	) {}

	async syncAccount(accountId: string): Promise<SyncOutcome> {
		const account = await this.prisma.mailAccount.findUnique({
			where: { id: accountId },
		});

		if (!account) {
			throw new UnrecoverableError(`Account ${accountId} no longer exists`);
		}

		if (account.status !== AccountStatus.ACTIVE) {
			throw new UnrecoverableError(
				`Account ${accountId} is ${account.status}; reconnection required`,
			);
		}

		try {
			const accessToken = await this.accountTokens.getAccessToken(account);
			const adapter = this.registry.get(account.provider);

			const outcome = account.syncCursor
				? await this.incrementalSync(account, accessToken, adapter)
				: await this.initialSync(account, accessToken, adapter);

			await this.prisma.mailAccount.update({
				where: { id: account.id },
				data: { lastSyncedAt: new Date(), lastSyncError: null },
			});

			this.logger.log(
				`Account ${account.id} [${outcome.mode}]: ${outcome.created} new, ${outcome.skipped} already stored, ${outcome.gone} gone`,
			);

			return outcome;
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'Unknown error';

			await this.prisma.mailAccount.update({
				where: { id: account.id },
				data: { lastSyncError: reason },
			});

			throw error;
		}
	}

	private async initialSync(
		account: MailAccount,
		accessToken: string,
		adapter: MailProviderAdapter,
	): Promise<SyncOutcome> {
		// Capture the cursor BEFORE fetching, so mail arriving mid-sync is
		// picked up next run instead of falling into the gap.
		const profile = await adapter.getProfile(accessToken);

		const page = await adapter.listMessageIds(accessToken, {
			maxResults: INITIAL_BATCH,
		});

		const counts = await this.ingestAll(
			account,
			accessToken,
			adapter,
			page.messageIds,
		);

		await this.prisma.mailAccount.update({
			where: { id: account.id },
			data: { syncCursor: profile.cursor },
		});

		return { accountId: account.id, mode: 'initial', ...counts };
	}

	private async incrementalSync(
		account: MailAccount,
		accessToken: string,
		adapter: MailProviderAdapter,
	): Promise<SyncOutcome> {
		const cursor = account.syncCursor!;
		const collected = new Set<string>();

		let pageToken: string | undefined;
		let nextCursor = cursor;

		do {
			const page = await adapter.listChangedMessageIds(accessToken, {
				cursor,
				pageToken,
			});

			if (page.cursorInvalid) {
				this.logger.warn(
					`Cursor expired for account ${account.id}; re-baselining`,
				);

				await this.prisma.mailAccount.update({
					where: { id: account.id },
					data: { syncCursor: null },
				});

				return this.initialSync(account, accessToken, adapter);
			}

			page.messageIds.forEach((id) => collected.add(id));

			if (page.cursor) {
				nextCursor = page.cursor;
			}

			pageToken = page.nextPageToken;
		} while (pageToken && collected.size < MAX_IDS_PER_RUN);

		const counts = await this.ingestAll(account, accessToken, adapter, [
			...collected,
		]);

		await this.prisma.mailAccount.update({
			where: { id: account.id },
			data: { syncCursor: nextCursor },
		});

		return { accountId: account.id, mode: 'incremental', ...counts };
	}

	private async ingestAll(
		account: MailAccount,
		accessToken: string,
		adapter: MailProviderAdapter,
		messageIds: string[],
	): Promise<{
		fetched: number;
		created: number;
		skipped: number;
		gone: number;
	}> {
		// The dedupe check must sit BEFORE the fetch. After it, the quota is already spent.
		const stored = await this.prisma.message.findMany({
			where: { accountId: account.id, providerMessageId: { in: messageIds } },
			select: { providerMessageId: true },
		});

		const known = new Set(stored.map((row) => row.providerMessageId));
		const toFetch = messageIds.filter((id) => !known.has(id));

		let created = 0;
		let skipped = known.size;
		let gone = 0;

		for (const providerMessageId of toFetch) {
			const raw = await adapter.fetchRawMessage(accessToken, providerMessageId);

			if (!raw) {
				gone++;
				continue;
			}

			const result = await this.ingestion.ingest(account, raw);

			if (result.created) {
				created++;
			} else {
				skipped++; // raced with the other worker (concurrency: 2)
			}
		}

		return { fetched: toFetch.length, created, skipped, gone };
	}
}
