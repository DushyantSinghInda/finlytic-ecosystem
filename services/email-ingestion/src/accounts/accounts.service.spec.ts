import { AccountsService } from './accounts.service.js';
import { MailProvider } from '../generated/prisma/enums.js';
import type { AccountTokenService } from './account-token.service.js';
import type { ConnectResult } from '../mail/providers/mail-provider.interface.js';
import type { EncryptionService } from '../crypto/encryption.service.js';
import type { MailProviderRegistry } from '../mail/mail-provider.registry.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { SyncQueueService } from '../queue/sync-queue.service.js';

const REQUIRED = ['ZohoMail.accounts.READ', 'ZohoMail.messages.READ'];

function buildHarness() {
	const upsert = jest.fn().mockResolvedValue({ id: 'acc-1' });
	const encrypt = jest.fn(() => 'v1.enc');

	const service = new AccountsService(
		{ mailAccount: { upsert } } as unknown as PrismaService,
		{ encrypt } as unknown as EncryptionService,
		{} as unknown as AccountTokenService,
		{
			get: () => ({ requiredScopes: REQUIRED }),
		} as unknown as MailProviderRegistry,
		{} as unknown as SyncQueueService,
	);

	return { service, upsert, encrypt };
}

function connectResult(scopes: string[]): ConnectResult {
	return {
		tokens: {
			accessToken: 'access',
			refreshToken: 'refresh',
			expiresAt: new Date(Date.now() + 3_600_000),
			scopes,
		},
		identity: { providerAccountId: 'zoho-1', emailAddress: 'a@b.com' },
		metadata: { location: 'in' },
	};
}

// Regression: a partial scope grant overwrote a working account.
describe('AccountsService.connect', () => {
	it('stores the account when every required scope was granted', async () => {
		const harness = buildHarness();

		await harness.service.connect(
			'user-1',
			MailProvider.ZOHO,
			connectResult(REQUIRED),
		);

		expect(harness.upsert).toHaveBeenCalledTimes(1);
	});

	it('rejects a partial grant without touching the existing row', async () => {
		const harness = buildHarness();

		await expect(
			harness.service.connect(
				'user-1',
				MailProvider.ZOHO,
				connectResult([REQUIRED[0]]),
			),
		).rejects.toThrow('Consent incomplete');

		// Granular consent lets a user untick one checkbox. Upserting first
		// would replace working tokens with tokens that cannot read mail —
		// and the row would still say ACTIVE.
		expect(harness.upsert).not.toHaveBeenCalled();
		expect(harness.encrypt).not.toHaveBeenCalled();
	});
});
