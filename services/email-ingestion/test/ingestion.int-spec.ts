import { randomUUID } from 'node:crypto';
import { MessageIngestionService } from '../src/messages/message-ingestion.service';
import { PrismaService } from '../src/prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';
import type { MailAccount } from '../src/generated/prisma/client';
import type { ObjectStorageService } from '../src/storage/object-storage.service';
import type { RawMessage } from '../src/mail/providers/mail-provider.interface';

const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ??
	'postgresql://test_svc:test_dev_pass@localhost:5435/email_test?schema=public';

// This suite deletes rows, so a mistyped URL must not be able to reach the
// development database.
if (!TEST_DATABASE_URL.includes('_test')) {
	throw new Error(
		`Refusing to run integration tests against ${TEST_DATABASE_URL}`,
	);
}

// MinIO is not under test. Faking it keeps a failure here pointing at the
// database rather than at storage.
const put = jest.fn(() => Promise.resolve('etag'));

const storage = {
	put,
	buildRawKey: (accountId: string, _sentAt: Date, id: string) =>
		`raw/${accountId}/${id}`,
	buildBodyKey: (accountId: string, _sentAt: Date, id: string) =>
		`body/${accountId}/${id}`,
} as unknown as ObjectStorageService;

function rawMessage(providerMessageId: string): RawMessage {
	return {
		providerMessageId,
		labels: ['INBOX'],
		raw: Buffer.from(
			[
				'From: Sender <sender@example.com>',
				'To: user@example.com',
				'Subject: Invoice 42',
				'Date: Fri, 05 Sep 2026 09:00:00 +0000',
				'',
				'Body text.',
			].join('\r\n'),
			'utf8',
		),
	};
}

describe('MessageIngestionService against Postgres', () => {
	const prisma = new PrismaService({
		get: () => TEST_DATABASE_URL,
	} as unknown as ConfigService);

	const ingestion = new MessageIngestionService(prisma, storage);
	// Every row this suite creates hangs off one user id, so cleanup is one
	// delete and cannot touch anything it did not make.
	const userId = randomUUID();

	let account: MailAccount;

	beforeAll(async () => {
		await prisma.$connect();

		account = await prisma.mailAccount.create({
			data: {
				userId,
				provider: 'GMAIL',
				providerAccountId: `test-${randomUUID()}`,
				emailAddress: 'user@example.com',
				accessTokenEnc: 'v1.not-a-real-envelope',
				accessTokenExpires: new Date(Date.now() + 3_600_000),
				scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
			},
		});
	});

	afterAll(async () => {
		// The test database is shared, so the suite cleans up after itself.
		// Messages cascade from the account.
		await prisma.mailAccount.deleteMany({ where: { userId } });
		await prisma.$disconnect();
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('stores a message once, however many times it is ingested', async () => {
		const message = rawMessage(`m-${randomUUID()}`);

		const first = await ingestion.ingest(account, message);
		const second = await ingestion.ingest(account, message);

		expect(first.created).toBe(true);
		expect(second.created).toBe(false);

		const rows = await prisma.message.count({
			where: {
				accountId: account.id,
				providerMessageId: message.providerMessageId,
			},
		});

		expect(rows).toBe(1);

		// Two uploads, not four: raw blob and body text from the first ingest
		// only. The second ingest has to skip the upload, not just the row.
		expect(put).toHaveBeenCalledTimes(2);
	});

	it('stores one row when two workers ingest the same message at once', async () => {
		const message = rawMessage(`m-${randomUUID()}`);

		const results = await Promise.all([
			ingestion.ingest(account, message),
			ingestion.ingest(account, message),
		]);

		// Both findUnique calls can return null before either insert lands, so
		// the check cannot be the guarantee. The unique constraint decides, and
		// the P2002 catch turns the loser into a skip instead of a failed job.
		expect(results.filter((result) => result.created)).toHaveLength(1);

		const rows = await prisma.message.count({
			where: {
				accountId: account.id,
				providerMessageId: message.providerMessageId,
			},
		});

		expect(rows).toBe(1);
	});

	it('scopes the constraint to the account, not the message id', async () => {
		const other = await prisma.mailAccount.create({
			data: {
				userId,
				provider: 'GMAIL',
				providerAccountId: `test-${randomUUID()}`,
				emailAddress: 'second@example.com',
				accessTokenEnc: 'v1.not-a-real-envelope',
				accessTokenExpires: new Date(Date.now() + 3_600_000),
				scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
			},
		});

		const message = rawMessage(`m-${randomUUID()}`);

		const mine = await ingestion.ingest(account, message);
		const theirs = await ingestion.ingest(other, message);

		// A unique index on provider_message_id alone would silently drop the
		// second account's copy — and look exactly like working deduplication.
		expect(mine.created).toBe(true);
		expect(theirs.created).toBe(true);
	});
});
