import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { MessagesService } from '../src/messages/messages.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { ConfigService } from '@nestjs/config';
import type { MailAccount } from '../src/generated/prisma/client.js';
import type { ObjectStorageService } from '../src/storage/object-storage.service.js';

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

// Object storage is faked so a failure here points at Postgres. Bodies are
// registered per test, because "the blob is missing" is behaviour under test
// rather than an accident.
const bodies = new Map<string, Buffer>();

const get = jest.fn((key: string) => {
	const body = bodies.get(key);

	return body
		? Promise.resolve(body)
		: Promise.reject(new Error(`NoSuchKey: ${key}`));
});

const storage = { get } as unknown as ObjectStorageService;

function accountData(userId: string, emailAddress: string) {
	return {
		userId,
		provider: 'GMAIL' as const,
		providerAccountId: `test-${randomUUID()}`,
		emailAddress,
		accessTokenEnc: 'v1.not-a-real-envelope',
		accessTokenExpires: new Date(Date.now() + 3_600_000),
		scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
	};
}

describe('MessagesService against Postgres', () => {
	const prisma = new PrismaService({
		get: () => TEST_DATABASE_URL,
	} as unknown as ConfigService);

	const messages = new MessagesService(prisma, storage);

	// Two users, so "not yours" means a real other person's mailbox rather than
	// a row that simply does not exist.
	const ownerId = randomUUID();
	const strangerId = randomUUID();

	let owned: MailAccount;
	let stranger: MailAccount;

	beforeAll(async () => {
		await prisma.$connect();

		owned = await prisma.mailAccount.create({
			data: accountData(ownerId, 'owner@example.com'),
		});
		stranger = await prisma.mailAccount.create({
			data: accountData(strangerId, 'stranger@example.com'),
		});

		// Five messages a minute apart, plus two sharing a timestamp — the
		// tiebreaker case that makes the cursor deterministic.
		const base = new Date('2026-09-01T10:00:00.000Z').getTime();

		await prisma.message.createMany({
			data: [
				...Array.from({ length: 5 }, (_, index) => ({
					accountId: owned.id,
					providerMessageId: `owned-${index}`,
					subject: `Owned ${index}`,
					sentAt: new Date(base + index * 60_000),
					toAddresses: ['owner@example.com'],
					labels: ['INBOX'],
					rawObjectKey: `raw/${owned.id}/owned-${index}`,
					bodyTextKey: `body/${owned.id}/owned-${index}`,
				})),
				{
					accountId: owned.id,
					providerMessageId: 'owned-tie-a',
					subject: 'Tie A',
					sentAt: new Date(base + 5 * 60_000),
					toAddresses: ['owner@example.com'],
					labels: ['INBOX'],
					rawObjectKey: `raw/${owned.id}/tie-a`,
				},
				{
					accountId: owned.id,
					providerMessageId: 'owned-tie-b',
					subject: 'Tie B',
					sentAt: new Date(base + 5 * 60_000),
					toAddresses: ['owner@example.com'],
					labels: ['INBOX'],
					rawObjectKey: `raw/${owned.id}/tie-b`,
				},
				{
					accountId: stranger.id,
					providerMessageId: 'stranger-0',
					subject: 'Not yours',
					sentAt: new Date(base),
					toAddresses: ['stranger@example.com'],
					labels: ['INBOX'],
					rawObjectKey: `raw/${stranger.id}/stranger-0`,
				},
			],
		});
	});

	afterAll(async () => {
		await prisma.mailAccount.deleteMany({
			where: { userId: { in: [ownerId, strangerId] } },
		});
		await prisma.$disconnect();
	});

	beforeEach(() => {
		bodies.clear();
		jest.clearAllMocks();
	});

	describe('listForAccount', () => {
		it('refuses an account the caller does not own', async () => {
			// The account exists. Only this check stands between two users' mail.
			await expect(
				messages.listForAccount(ownerId, stranger.id, undefined, 25),
			).rejects.toThrow('Account not found');
		});

		it('returns newest first', async () => {
			const page = await messages.listForAccount(
				ownerId,
				owned.id,
				undefined,
				10,
			);

			const times = page.messages.map((message) =>
				new Date(message.sentAt).getTime(),
			);

			expect(times).toEqual([...times].sort((a, b) => b - a));
		});

		it('pages without repeating or skipping a row', async () => {
			const first = await messages.listForAccount(
				ownerId,
				owned.id,
				undefined,
				3,
			);
			const second = await messages.listForAccount(
				ownerId,
				owned.id,
				first.nextCursor ?? undefined,
				3,
			);
			const third = await messages.listForAccount(
				ownerId,
				owned.id,
				second.nextCursor ?? undefined,
				3,
			);

			const seen = [
				...first.messages,
				...second.messages,
				...third.messages,
			].map((message) => message.id);

			// Seven messages belong to this account, and each appears once.
			expect(seen).toHaveLength(7);
			expect(new Set(seen).size).toBe(7);
			expect(third.nextCursor).toBeNull();
		});

		it('keeps a stable order across messages sharing a timestamp', async () => {
			// Without the id tiebreaker the two "Tie" rows can swap between
			// queries, which makes a cursor skip one and repeat the other.
			const first = await messages.listForAccount(
				ownerId,
				owned.id,
				undefined,
				7,
			);
			const again = await messages.listForAccount(
				ownerId,
				owned.id,
				undefined,
				7,
			);

			expect(again.messages.map((message) => message.id)).toEqual(
				first.messages.map((message) => message.id),
			);
		});

		it('reports no next cursor on the last page', async () => {
			const page = await messages.listForAccount(
				ownerId,
				owned.id,
				undefined,
				50,
			);

			expect(page.messages).toHaveLength(7);
			expect(page.nextCursor).toBeNull();
		});
	});

	describe('getForAccount', () => {
		it('refuses a message belonging to another user', async () => {
			const theirs = await prisma.message.findFirstOrThrow({
				where: { accountId: stranger.id },
				select: { id: true },
			});

			// Their account id, their message id — but the wrong caller.
			await expect(
				messages.getForAccount(ownerId, stranger.id, theirs.id),
			).rejects.toThrow('Message not found');
		});

		it('refuses another user’s message through an account it does own', async () => {
			const theirs = await prisma.message.findFirstOrThrow({
				where: { accountId: stranger.id },
				select: { id: true },
			});

			// Caller's own account id, someone else's message id: the pair has to
			// match, not just the account.
			await expect(
				messages.getForAccount(ownerId, owned.id, theirs.id),
			).rejects.toThrow('Message not found');
		});

		it('reads the body back from object storage', async () => {
			const message = await prisma.message.findFirstOrThrow({
				where: { accountId: owned.id, bodyTextKey: { not: null } },
				select: { id: true, bodyTextKey: true },
			});

			bodies.set(
				message.bodyTextKey as string,
				Buffer.from('Hello from storage', 'utf8'),
			);

			const detail = await messages.getForAccount(
				ownerId,
				owned.id,
				message.id,
			);

			expect(detail.bodyText).toBe('Hello from storage');
			expect(detail.bodyTruncated).toBe(false);
		});

		it('returns a null body when the object is missing', async () => {
			const message = await prisma.message.findFirstOrThrow({
				where: { accountId: owned.id, bodyTextKey: { not: null } },
				select: { id: true },
			});

			// Nothing registered, so storage rejects. Postgres and object storage
			// can drift, and the message still exists.
			const detail = await messages.getForAccount(
				ownerId,
				owned.id,
				message.id,
			);

			expect(detail.bodyText).toBeNull();
			expect(detail.subject).not.toBeNull();
		});

		it('does not touch storage when the message never had a body', async () => {
			const message = await prisma.message.findFirstOrThrow({
				where: { accountId: owned.id, bodyTextKey: null },
				select: { id: true },
			});

			const detail = await messages.getForAccount(
				ownerId,
				owned.id,
				message.id,
			);

			expect(get).not.toHaveBeenCalled();
			expect(detail.bodyText).toBeNull();
		});

		it('truncates a body past the cap and says so', async () => {
			const message = await prisma.message.findFirstOrThrow({
				where: { accountId: owned.id, bodyTextKey: { not: null } },
				select: { id: true, bodyTextKey: true },
			});

			bodies.set(message.bodyTextKey as string, Buffer.alloc(300 * 1024, 0x61));

			const detail = await messages.getForAccount(
				ownerId,
				owned.id,
				message.id,
			);

			expect(detail.bodyTruncated).toBe(true);
			expect(detail.bodyText?.length).toBe(256 * 1024);
		});

		it('never exposes a storage key', async () => {
			const message = await prisma.message.findFirstOrThrow({
				where: { accountId: owned.id },
				select: { id: true },
			});

			const detail = await messages.getForAccount(
				ownerId,
				owned.id,
				message.id,
			);

			// Storage keys are internal addressing; a browser has no use for one.
			expect(detail).not.toHaveProperty('bodyTextKey');
			expect(detail).not.toHaveProperty('rawObjectKey');
		});
	});

	describe('rawObjectKeyFor', () => {
		it('refuses a message belonging to another user', async () => {
			const theirs = await prisma.message.findFirstOrThrow({
				where: { accountId: stranger.id },
				select: { id: true },
			});

			await expect(
				messages.rawObjectKeyFor(ownerId, stranger.id, theirs.id),
			).rejects.toThrow('Message not found');
		});

		it('refuses another user’s message through an account it does own', async () => {
			const theirs = await prisma.message.findFirstOrThrow({
				where: { accountId: stranger.id },
				select: { id: true },
			});

			// The download route repeats the ownership rule the detail route
			// already has. Repeated rules are exactly the ones that drift.
			await expect(
				messages.rawObjectKeyFor(ownerId, owned.id, theirs.id),
			).rejects.toThrow('Message not found');
		});

		it('returns the stored key for a message the caller owns', async () => {
			const mine = await prisma.message.findFirstOrThrow({
				where: { accountId: owned.id },
				select: { id: true, rawObjectKey: true },
			});

			await expect(
				messages.rawObjectKeyFor(ownerId, owned.id, mine.id),
			).resolves.toBe(mine.rawObjectKey);
		});
	});
});
