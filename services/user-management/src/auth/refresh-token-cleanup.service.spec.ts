import { jest } from '@jest/globals';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('RefreshTokenCleanupService', () => {
	const deleteMany =
		jest.fn<(args: { where: Record<string, unknown> }) => Promise<unknown>>();
	const prisma = { refreshToken: { deleteMany } } as unknown as PrismaService;
	const service = new RefreshTokenCleanupService(prisma);

	beforeEach(() => {
		jest.clearAllMocks();
		deleteMany.mockResolvedValue({ count: 0 });
	});

	it('deletes only rows that have expired', async () => {
		const before = Date.now();
		await service.sweep();
		const after = Date.now();

		const where = deleteMany.mock.calls[0]?.[0].where as {
			expiresAt: { lt: Date };
		};

		expect(where.expiresAt.lt.getTime()).toBeGreaterThanOrEqual(before);
		expect(where.expiresAt.lt.getTime()).toBeLessThanOrEqual(after);
	});

	it('never filters on revokedAt', async () => {
		await service.sweep();

		const where = deleteMany.mock.calls[0]?.[0].where;

		// The rule this protects: a revoked-but-unexpired row is what turns a
		// replayed token into *detected reuse* rather than an unknown token.
		// Sweeping revoked rows early would quietly disarm the theft signal in
		// architecture rule 6 — the family would never be revoked.
		expect(where).not.toHaveProperty('revokedAt');
		expect(Object.keys(where)).toEqual(['expiresAt']);
	});

	it('reports how many rows went', async () => {
		deleteMany.mockResolvedValue({ count: 42 });

		await expect(service.sweep()).resolves.toBe(42);
	});

	it('survives a database failure without throwing', async () => {
		// Housekeeping runs on a timer with nothing to catch it. A rejection here
		// would reach the process-level handler and take the service down for a
		// job whose only purpose is tidiness.
		deleteMany.mockRejectedValue(new Error('connection terminated'));

		await expect(service.sweep()).resolves.toBe(0);
	});

	it('does not hold the process open', () => {
		service.onModuleInit();

		// An un-unref'd interval keeps Node alive, so `docker stop` would wait the
		// full grace period on every deploy.
		const timer = (service as unknown as { timer: { hasRef(): boolean } })
			.timer;
		expect(timer.hasRef()).toBe(false);

		service.onModuleDestroy();
	});
});
