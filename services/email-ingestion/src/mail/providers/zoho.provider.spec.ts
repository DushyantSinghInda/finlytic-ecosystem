import { ZohoProvider } from './zoho.provider';
import type { ConfigService } from '@nestjs/config';
import type { ProviderConnection } from './mail-provider.interface';

const connection: ProviderConnection = {
	accessToken: 'zoho-token',
	providerAccountId: 'acct-9',
	metadata: { location: 'in' },
};

interface ZohoRow {
	messageId: string;
	receivedTime: string;
}

/** Zoho wraps its payload in `{ data: [...] }` and sorts newest first. */
function mockZohoPage(data: ZohoRow[]) {
	return jest.spyOn(globalThis, 'fetch').mockResolvedValue({
		ok: true,
		json: () => Promise.resolve({ data }),
	} as unknown as Response);
}

function rows(count: number, newest: number): ZohoRow[] {
	return Array.from({ length: count }, (_, index) => ({
		messageId: `m${index}`,
		receivedTime: String(newest - index),
	}));
}

describe('ZohoProvider.listChangedMessageIds', () => {
	const provider = new ZohoProvider({} as unknown as ConfigService);

	afterEach(() => {
		jest.restoreAllMocks();
	});

	// Zoho has no history log — the cursor is a received-time watermark.
	it('includes the message sitting exactly on the watermark', async () => {
		mockZohoPage([
			{ messageId: 'newer', receivedTime: '1000' },
			{ messageId: 'boundary', receivedTime: '900' },
			{ messageId: 'older', receivedTime: '800' },
		]);

		const page = await provider.listChangedMessageIds(connection, {
			cursor: '900',
		});

		// `>=`, not `>`. A duplicate is free under the unique constraint;
		// a gap is permanent and nothing ever reports it.
		expect(page.messageIds).toEqual(['newer', 'boundary']);
	});

	it('reads page 1 from the account-s own data centre', async () => {
		const fetchSpy = mockZohoPage(rows(3, 1000));

		await provider.listChangedMessageIds(connection, { cursor: '0' });

		expect(fetchSpy.mock.calls[0][0]).toBe(
			'https://mail.zoho.in/api/accounts/acct-9/messages/view?start=1&limit=200&sortBy=date&sortorder=false',
		);
	});

	it('takes a new cursor from page 1 only', async () => {
		mockZohoPage(rows(3, 1000));

		const first = await provider.listChangedMessageIds(connection, {
			cursor: '0',
		});

		expect(first.cursor).toBe('1000');

		jest.restoreAllMocks();
		mockZohoPage(rows(3, 700));

		const second = await provider.listChangedMessageIds(connection, {
			cursor: '0',
			pageToken: '201',
		});

		// Page 2 is older mail. Its timestamp would drag the watermark backwards
		// and re-sync everything in between on every run after this one.
		expect(second.cursor).toBeUndefined();
	});

	it('stops paging as soon as a page runs past the watermark', async () => {
		mockZohoPage(rows(200, 5000));

		const full = await provider.listChangedMessageIds(connection, {
			cursor: '0',
		});

		// A full page, entirely fresh — there may be more behind it.
		expect(full.nextPageToken).toBe('201');

		jest.restoreAllMocks();
		mockZohoPage(rows(200, 5000));

		const partial = await provider.listChangedMessageIds(connection, {
			cursor: '4900',
		});

		// 5000 down to 4900 inclusive. The rest of the page is older, so this
		// page is the last one worth reading.
		expect(partial.messageIds).toHaveLength(101);
		expect(partial.nextPageToken).toBeUndefined();
	});
});

describe('ZohoProvider region allowlist', () => {
	const provider = new ZohoProvider({} as unknown as ConfigService);

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('resolves a known region to its own data centre', async () => {
		const fetchSpy = mockZohoPage([]);

		await provider.listChangedMessageIds(
			{ ...connection, metadata: { location: 'eu' } },
			{ cursor: '0' },
		);

		expect(fetchSpy).toHaveBeenCalledWith(
			expect.stringContaining('https://mail.zoho.eu/'),
			expect.anything(),
		);
	});

	it('refuses an unknown region instead of building a URL from it', async () => {
		const fetchSpy = mockZohoPage([]);

		await expect(
			provider.listChangedMessageIds(
				{ ...connection, metadata: { location: 'attacker.example.com' } },
				{ cursor: '0' },
			),
		).rejects.toThrow('Unknown Zoho data centre');

		// The half that matters: the access token never left the process.
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('refuses an absent region rather than defaulting to us', async () => {
		const fetchSpy = mockZohoPage([]);

		await expect(
			provider.listChangedMessageIds(
				{ ...connection, metadata: {} },
				{ cursor: '0' },
			),
		).rejects.toThrow('Zoho did not return a location');

		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
