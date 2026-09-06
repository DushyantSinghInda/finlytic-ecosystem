import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RefreshTokenService } from '../src/auth/refresh-token.service.js';
import type { ConfigService } from '@nestjs/config';

const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ??
	'postgresql://test_svc:test_dev_pass@localhost:5435/users_test?schema=public';

if (!TEST_DATABASE_URL.includes('_test')) {
	throw new Error(
		`Refusing to run integration tests against ${TEST_DATABASE_URL}`,
	);
}

describe('RefreshTokenService against Postgres', () => {
	const prisma = new PrismaService({
		get: () => TEST_DATABASE_URL,
	} as unknown as ConfigService);

	// The TTL is the only config this service reads, so a fake that returns a
	// number is the whole dependency.
	const buildTokens = (ttlDays: number) =>
		new RefreshTokenService(prisma, {
			get: () => ttlDays,
		} as unknown as ConfigService);

	const tokens = buildTokens(30);
	const email = `rotation-${randomUUID()}@example.test`;

	let userId: string;

	beforeAll(async () => {
		await prisma.$connect();

		const user = await prisma.user.create({
			data: { email, passwordHash: 'not-a-real-hash' },
		});

		userId = user.id;
	});

	afterAll(async () => {
		// Refresh tokens cascade from the user.
		await prisma.user.deleteMany({ where: { email } });
		await prisma.$disconnect();
	});

	it('spends a live token exactly once', async () => {
		const issued = await tokens.startFamily(userId, {});

		const spent = await tokens.spend(issued.raw);
		const replay = await tokens.spend(issued.raw);

		expect(spent?.id).toBe(issued.record.id);
		expect(spent?.revokedAt).not.toBeNull();
		// A spent token is worth nothing on the second presentation.
		expect(replay).toBeNull();
	});

	it('kills the whole family when a spent token is replayed', async () => {
		const first = await tokens.startFamily(userId, {});
		// What AuthService does on a successful refresh: a new token in the
		// same family.
		const second = await tokens.issue(userId, first.record.familyId, {});

		await tokens.spend(first.raw);
		await tokens.spend(first.raw); // the theft signal

		const survivor = await prisma.refreshToken.findUnique({
			where: { id: second.record.id },
		});

		// The replayed token was already dead — killing it again would achieve
		// nothing. The live sibling is what an attacker would hold, so the
		// family goes with it.
		expect(survivor?.revokedAt).not.toBeNull();
	});

	it('rejects an expired token without killing the family', async () => {
		const expiring = buildTokens(-1); // issued already expired
		const issued = await expiring.startFamily(userId, {});

		const spent = await tokens.spend(issued.raw);

		expect(spent).toBeNull();

		const row = await prisma.refreshToken.findUnique({
			where: { id: issued.record.id },
		});

		// Expiry is not theft. Revoking the family here would log the user out of
		// every device after a laptop was simply left closed too long.
		expect(row?.revokedAt).toBeNull();
	});

	it('lets exactly one of two concurrent spends win', async () => {
		const issued = await tokens.startFamily(userId, {});

		const results = await Promise.all([
			tokens.spend(issued.raw),
			tokens.spend(issued.raw),
		]);

		// Postgres serialises the two UPDATEs on the row lock: the second one
		// re-evaluates `revokedAt: null` after the first commits and matches
		// zero rows. count === 1 is the whole guarantee.
		expect(results.filter(Boolean)).toHaveLength(1);
	});
});
