import { toPublicUser } from './user.mapper';
import type { User } from '../generated/prisma/client';

describe('toPublicUser', () => {
	it('exposes five fields and no more', () => {
		const user = {
			id: 'user-1',
			email: 'a@b.com',
			passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$ZmFrZQ',
			role: 'USER',
			isActive: true,
			createdAt: new Date('2026-01-01T00:00:00Z'),
			updatedAt: new Date('2026-01-01T00:00:00Z'),
		} as User;

		const publicUser = toPublicUser(user);

		// An allowlist, asserted exactly: a field added to the Prisma model cannot
		// reach a response without this test failing first. That is why the mapper
		// builds a new object instead of deleting fields from the row.
		expect(Object.keys(publicUser).sort()).toEqual([
			'createdAt',
			'email',
			'id',
			'isActive',
			'role',
		]);
	});
});
