import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { Prisma } from '../generated/prisma/client.js';
import type { ConfigService } from '@nestjs/config';
import type { RefreshTokenService } from './refresh-token.service.js';
import type { TokenService } from './token.service.js';
import type { User } from '../generated/prisma/client.js';
import type { UsersService } from '../users/users.service.js';

const PASSWORD = 'correct-horse-battery-staple';

function buildUser(overrides: Partial<User> = {}): User {
	return {
		id: 'user-1',
		email: 'a@b.com',
		passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$ZmFrZQ',
		role: 'USER',
		isActive: true,
		createdAt: new Date('2026-01-01T00:00:00Z'),
		updatedAt: new Date('2026-01-01T00:00:00Z'),
		...overrides,
	};
}

function buildHarness(realHasher?: PasswordHasher) {
	const hash = jest
		.fn()
		.mockResolvedValue('$argon2id$v=19$m=19456,p=1,t=2$fake');
	const verify = jest.fn().mockResolvedValue(false);
	const passwordHasher = realHasher ?? { hash, verify };

	const findByEmail = jest.fn().mockResolvedValue(null);
	const findById = jest.fn().mockResolvedValue(null);
	const create = jest.fn();

	const startFamily = jest.fn().mockResolvedValue({
		raw: 'refresh-raw',
		record: { id: 'rt-1', familyId: 'fam-1' },
	});
	const issue = jest.fn().mockResolvedValue({
		raw: 'refresh-new',
		record: { id: 'rt-2' },
	});
	const spend = jest.fn().mockResolvedValue(null);
	const linkReplacement = jest.fn().mockResolvedValue(undefined);
	const revokeFamily = jest.fn().mockResolvedValue(undefined);

	const service = new AuthService(
		{ findByEmail, findById, create } as unknown as UsersService,
		{
			issueAccessToken: () => Promise.resolve('access-jwt'),
		} as unknown as TokenService,
		{ get: () => 900 } as unknown as ConfigService,
		{
			startFamily,
			issue,
			spend,
			linkReplacement,
			revokeFamily,
		} as unknown as RefreshTokenService,
		passwordHasher,
	);

	return {
		service,
		findByEmail,
		findById,
		create,
		startFamily,
		issue,
		spend,
		linkReplacement,
		revokeFamily,
		hash,
		verify,
	};
}

describe('AuthService.login', () => {
	// One harness for the suite; the injected hasher makes the decoy free.
	const harness = buildHarness();
	const verifiedAgainst: string[] = [];

	function verifyReturns(result: boolean) {
		harness.verify.mockImplementation((digest: string) => {
			verifiedAgainst.push(digest);
			return Promise.resolve(result);
		});
	}

	beforeAll(async () => {
		await harness.service.onModuleInit();
	});

	beforeEach(() => {
		jest.clearAllMocks();
		verifiedAgainst.length = 0;
		harness.findByEmail.mockResolvedValue(null);
	});

	// The timing defence: one verification always runs, user or no user.
	it('runs a verification even when the email is unknown', async () => {
		verifyReturns(false);

		await expect(
			harness.service.login(
				{ email: 'nobody@example.com', password: PASSWORD },
				{},
			),
		).rejects.toThrow('Invalid email or password');

		// Without the decoy this is zero, and an unknown email answers in ~1ms
		// while a known one takes ~60ms. That gap is a user-enumeration oracle.
		expect(harness.verify).toHaveBeenCalledTimes(1);
		expect(verifiedAgainst[0]).toMatch(/^\$argon2id\$/);
	});

	it('rejects a wrong password without opening a session', async () => {
		verifyReturns(false);

		const user = buildUser();
		harness.findByEmail.mockResolvedValue(user);

		await expect(
			harness.service.login({ email: user.email, password: 'wrong' }, {}),
		).rejects.toThrow('Invalid email or password');

		expect(verifiedAgainst).toEqual([user.passwordHash]);
		expect(harness.startFamily).not.toHaveBeenCalled();
	});

	it('refuses a deactivated user who knows the password', async () => {
		verifyReturns(true);
		harness.findByEmail.mockResolvedValue(buildUser({ isActive: false }));

		// Same message as a wrong password. "This account is disabled" would
		// confirm the address is registered.
		await expect(
			harness.service.login({ email: 'a@b.com', password: PASSWORD }, {}),
		).rejects.toThrow('Invalid email or password');

		expect(harness.startFamily).not.toHaveBeenCalled();
	});

	it('returns a session that carries no password hash', async () => {
		verifyReturns(true);
		harness.findByEmail.mockResolvedValue(buildUser());

		const session = await harness.service.login(
			{ email: 'a@b.com', password: PASSWORD },
			{ ipAddress: '127.0.0.1' },
		);

		expect(session.accessToken).toBe('access-jwt');
		expect(session.refreshToken).toBe('refresh-raw');
		expect(session.tokenType).toBe('Bearer');
		expect(harness.startFamily).toHaveBeenCalledWith('user-1', {
			ipAddress: '127.0.0.1',
		});

		// The mapper is the only thing between the row and the response.
		expect(JSON.stringify(session)).not.toContain('argon2');
	});
});

describe('AuthService.register', () => {
	it('stores a hash and never the password', async () => {
		// A real hasher here: this test doubles as the check that the native
		// module builds and the 19 MiB cost is applied.
		const hasher = new PasswordHasher();
		const harness = buildHarness(hasher);
		let storedHash = '';

		harness.create.mockImplementation((email: string, passwordHash: string) => {
			storedHash = passwordHash;
			return Promise.resolve(buildUser({ email, passwordHash }));
		});

		const user = await harness.service.register({
			email: 'new@example.com',
			password: PASSWORD,
		});

		expect(storedHash).not.toContain(PASSWORD);
		expect(storedHash).toMatch(/^\$argon2id\$v=19\$/);
		expect(storedHash).toContain('m=19456');
		expect(storedHash).toContain('t=2');
		expect(storedHash).toContain('p=1');
		await expect(hasher.verify(storedHash, PASSWORD)).resolves.toBe(true);

		expect(user).not.toHaveProperty('passwordHash');
	});

	it('turns a duplicate email into a 409, not a 500', async () => {
		const harness = buildHarness();
		harness.create.mockRejectedValue(
			new Prisma.PrismaClientKnownRequestError('duplicate', {
				code: 'P2002',
				clientVersion: '7.10.0',
			}),
		);

		await expect(
			harness.service.register({
				email: 'taken@example.com',
				password: PASSWORD,
			}),
		).rejects.toThrow('An account with this email already exists');
	});
});

describe('AuthService.refresh', () => {
	it('rejects a token that spend() would not accept', async () => {
		const harness = buildHarness();
		harness.spend.mockResolvedValue(null);

		await expect(
			harness.service.refresh({ refreshToken: 'whatever' }, {}),
		).rejects.toThrow('Invalid refresh token');

		// spend() already decided. Looking the user up anyway would be work
		// done on behalf of an unauthenticated caller.
		expect(harness.findById).not.toHaveBeenCalled();
	});

	it('revokes the family when the account is deactivated mid-session', async () => {
		const harness = buildHarness();
		harness.spend.mockResolvedValue({
			id: 'rt-1',
			userId: 'user-1',
			familyId: 'fam-1',
		});
		harness.findById.mockResolvedValue(buildUser({ isActive: false }));

		await expect(
			harness.service.refresh({ refreshToken: 'valid-but-stale' }, {}),
		).rejects.toThrow('Invalid refresh token');

		// A deactivated account must not keep a live refresh chain.
		expect(harness.revokeFamily).toHaveBeenCalledWith('fam-1');
		expect(harness.issue).not.toHaveBeenCalled();
	});

	it('rotates within the family and links the replacement', async () => {
		const harness = buildHarness();
		harness.spend.mockResolvedValue({
			id: 'rt-1',
			userId: 'user-1',
			familyId: 'fam-1',
		});
		harness.findById.mockResolvedValue(buildUser());

		const session = await harness.service.refresh(
			{ refreshToken: 'valid' },
			{},
		);

		// Same family, new token — that chain is what makes reuse detectable.
		expect(harness.issue).toHaveBeenCalledWith('user-1', 'fam-1', {});
		expect(harness.linkReplacement).toHaveBeenCalledWith('rt-1', 'rt-2');
		expect(session.refreshToken).toBe('refresh-new');
	});
});
