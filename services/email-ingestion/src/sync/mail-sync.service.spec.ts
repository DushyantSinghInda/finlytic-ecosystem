import { MailSyncService } from './mail-sync.service.js';
import type { AccountTokenService } from '../accounts/account-token.service.js';
import type { MailProviderRegistry } from '../mail/mail-provider.registry.js';
import type { MessageIngestionService } from '../messages/message-ingestion.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { MailAccount } from '../generated/prisma/client.js';
import type {
	MailProviderAdapter,
	ProviderConnection,
	RawMessage,
} from '../mail/providers/mail-provider.interface.js';

const ACCOUNT_ID = 'acc-1';

function rawMessage(id: string): RawMessage {
	return {
		providerMessageId: id,
		labels: [],
		raw: Buffer.from(`Subject: ${id}\r\n\r\nbody`, 'utf8'),
	};
}

function buildHarness(options: {
	adapter: Partial<MailProviderAdapter>;
	syncCursor?: string | null;
	stored?: string[];
}) {
	const account = {
		id: ACCOUNT_ID,
		provider: 'GMAIL',
		status: 'ACTIVE',
		providerAccountId: 'p-1',
		providerMetadata: null,
		accessTokenExpires: new Date(Date.now() + 3_600_000),
		syncCursor: options.syncCursor ?? null,
	} as unknown as MailAccount;

	// Ordered logs of what the service recorded; the assertions are about progress.
	const cursorWrites: (string | null)[] = [];
	const errorWrites: (string | null)[] = [];
	const ingested: string[] = [];

	const prisma = {
		mailAccount: {
			findUnique: jest.fn().mockResolvedValue(account),
			update: jest.fn((args: { data: Record<string, unknown> }) => {
				if ('syncCursor' in args.data) {
					cursorWrites.push((args.data.syncCursor as string | null) ?? null);
				}
				if ('lastSyncError' in args.data) {
					errorWrites.push((args.data.lastSyncError as string | null) ?? null);
				}
				return Promise.resolve(account);
			}),
		},
		message: {
			findMany: jest.fn(() =>
				Promise.resolve(
					(options.stored ?? []).map((id) => ({ providerMessageId: id })),
				),
			),
		},
	} as unknown as PrismaService;

	const connection: ProviderConnection = {
		accessToken: 'token',
		providerAccountId: 'p-1',
		metadata: {},
	};

	const accountTokens = {
		getConnection: jest.fn().mockResolvedValue(connection),
	} as unknown as AccountTokenService;

	const registry = {
		get: jest.fn().mockReturnValue(options.adapter),
	} as unknown as MailProviderRegistry;

	const ingestion = {
		ingest: jest.fn((_acct: MailAccount, raw: RawMessage) => {
			// Fires if the null guard in ingestAll is removed.
			if (!raw) {
				throw new Error('ingest() called with no message');
			}
			ingested.push(raw.providerMessageId);
			return Promise.resolve({
				providerMessageId: raw.providerMessageId,
				created: true,
			});
		}),
	} as unknown as MessageIngestionService;

	const service = new MailSyncService(
		prisma,
		accountTokens,
		registry,
		ingestion,
	);

	return { service, cursorWrites, errorWrites, ingested };
}

describe('MailSyncService', () => {
	// Regression: one deleted message froze an account's mailbox permanently.
	it('skips a message the provider no longer has and finishes the run', async () => {
		const fetched: string[] = [];

		const harness = buildHarness({
			adapter: {
				getProfile: () =>
					Promise.resolve({ emailAddress: 'a@b.com', cursor: 'cursor-2' }),
				listMessageIds: () =>
					Promise.resolve({ messageIds: ['m1', 'm2', 'm3'] }),
				fetchRawMessage: (_conn, id) => {
					fetched.push(id);
					// m2 is the poison pill: still in history, gone from the mailbox.
					return Promise.resolve(id === 'm2' ? null : rawMessage(id));
				},
			},
		});

		const outcome = await harness.service.syncAccount(ACCOUNT_ID);

		expect(fetched).toEqual(['m1', 'm2', 'm3']);
		expect(harness.ingested).toEqual(['m1', 'm3']);
		expect(outcome.gone).toBe(1);
		expect(outcome.created).toBe(2);
		// The run reached the end and recorded progress.
		expect(harness.cursorWrites).toEqual(['cursor-2']);
	});

	// Regression: the retry re-downloaded everything it had already stored.
	it('never fetches an id that is already stored', async () => {
		const fetched: string[] = [];

		const harness = buildHarness({
			stored: ['m1', 'm3'],
			adapter: {
				getProfile: () =>
					Promise.resolve({ emailAddress: 'a@b.com', cursor: 'cursor-2' }),
				listMessageIds: () =>
					Promise.resolve({ messageIds: ['m1', 'm2', 'm3'] }),
				fetchRawMessage: (_conn, id) => {
					fetched.push(id);
					return Promise.resolve(rawMessage(id));
				},
			},
		});

		const outcome = await harness.service.syncAccount(ACCOUNT_ID);

		// The quota is spent inside fetchRawMessage. ingest()'s own findUnique is
		// one call too late to save it.
		expect(fetched).toEqual(['m2']);
		expect(outcome.fetched).toBe(1);
		expect(outcome.skipped).toBe(2);
	});

	// Regression: the cursor captured after the work leaves a permanent gap.
	it('captures the cursor before ingestion, not after', async () => {
		const calls: string[] = [];
		let providerCursor = 'before';

		const harness = buildHarness({
			adapter: {
				getProfile: () => {
					calls.push('getProfile');
					return Promise.resolve({
						emailAddress: 'a@b.com',
						cursor: providerCursor,
					});
				},
				listMessageIds: () => {
					calls.push('listMessageIds');
					return Promise.resolve({ messageIds: ['m1'] });
				},
				fetchRawMessage: (_conn, id) => {
					calls.push('fetchRawMessage');
					// Mail lands while the run is still working.
					providerCursor = 'after';
					return Promise.resolve(rawMessage(id));
				},
			},
		});

		await harness.service.syncAccount(ACCOUNT_ID);

		expect(calls).toEqual(['getProfile', 'listMessageIds', 'fetchRawMessage']);
		// Writing 'after' would skip everything that arrived mid-run, forever.
		expect(harness.cursorWrites).toEqual(['before']);
	});

	// Regression: an expired historyId is recoverable, not fatal.
	it('re-baselines when the provider rejects the cursor', async () => {
		const harness = buildHarness({
			syncCursor: 'stale-history-id',
			adapter: {
				listChangedMessageIds: () =>
					Promise.resolve({ messageIds: [], cursorInvalid: true }),
				getProfile: () =>
					Promise.resolve({ emailAddress: 'a@b.com', cursor: 'fresh' }),
				listMessageIds: () => Promise.resolve({ messageIds: [] }),
			},
		});

		const outcome = await harness.service.syncAccount(ACCOUNT_ID);

		expect(outcome.mode).toBe('initial');
		// Cleared first, then re-baselined — never left pointing at a dead cursor.
		expect(harness.cursorWrites).toEqual([null, 'fresh']);
	});

	// Regression: why the cursor advance stays all-or-nothing.
	it('records no progress when the run throws part way', async () => {
		const harness = buildHarness({
			syncCursor: 'cursor-1',
			adapter: {
				listChangedMessageIds: () =>
					Promise.resolve({ messageIds: ['m1', 'm2'], cursor: 'cursor-2' }),
				fetchRawMessage: (_conn, id) =>
					id === 'm2'
						? Promise.reject(new Error('403 quota exceeded'))
						: Promise.resolve(rawMessage(id)),
			},
		});

		await expect(harness.service.syncAccount(ACCOUNT_ID)).rejects.toThrow(
			'403 quota exceeded',
		);

		// Work happened.
		expect(harness.ingested).toEqual(['m1']);
		// None of it was recorded. The retry redoes it cheaply because of the
		// pre-fetch filter.
		expect(harness.cursorWrites).toEqual([]);
		expect(harness.errorWrites).toEqual(['403 quota exceeded']);
	});
});
