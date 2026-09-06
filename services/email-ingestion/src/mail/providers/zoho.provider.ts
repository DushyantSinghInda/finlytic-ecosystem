import {
	BadGatewayException,
	BadRequestException,
	Injectable,
	Logger,
	ServiceUnavailableException,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailProvider } from '../../generated/prisma/client';
import type {
	ConnectResult,
	MailProviderAdapter,
	MessageChangePage,
	MessageListPage,
	OAuthTokens,
	ProviderConnection,
	ProviderMetadata,
	ProviderProfile,
	RawMessage,
} from './mail-provider.interface';

/**
 * Zoho runs independent data centres and a refresh token issued by one is
 * worthless at another. This map doubles as the allowlist: `location` arrives on
 * a browser redirect, so it selects a known row and never builds a URL.
 */
const DATA_CENTRES: Record<string, { accounts: string; mail: string }> = {
	us: { accounts: 'https://accounts.zoho.com', mail: 'https://mail.zoho.com' },
	eu: { accounts: 'https://accounts.zoho.eu', mail: 'https://mail.zoho.eu' },
	in: { accounts: 'https://accounts.zoho.in', mail: 'https://mail.zoho.in' },
	au: {
		accounts: 'https://accounts.zoho.com.au',
		mail: 'https://mail.zoho.com.au',
	},
	jp: { accounts: 'https://accounts.zoho.jp', mail: 'https://mail.zoho.jp' },
	ca: {
		accounts: 'https://accounts.zohocloud.ca',
		mail: 'https://mail.zohocloud.ca',
	},
	sa: { accounts: 'https://accounts.zoho.sa', mail: 'https://mail.zoho.sa' },
	uk: { accounts: 'https://accounts.zoho.uk', mail: 'https://mail.zoho.uk' },
};

const SCOPES = ['ZohoMail.accounts.READ', 'ZohoMail.messages.READ'];

interface ZohoTokenResponse {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	scope?: string;
	api_domain?: string;
	/** Zoho reports OAuth failures in the body of a 200 response. */
	error?: string;
}

interface ZohoAccountsResponse {
	data?: { accountId: string; primaryEmailAddress: string }[];
}

interface ZohoMessage {
	messageId: string;
	threadId?: string;
	receivedTime: string;
	size?: string;
	summary?: string;
}

@Injectable()
export class ZohoProvider implements MailProviderAdapter {
	readonly provider = MailProvider.ZOHO;
	readonly requiredScopes = SCOPES;

	private readonly logger = new Logger(ZohoProvider.name);

	constructor(private readonly configService: ConfigService) {}

	private async request(
		connection: ProviderConnection,
		path: string,
	): Promise<Response> {
		const base = this.resolveLocation(connection.metadata.location).mail;
		const url = `${base}/api/accounts/${connection.providerAccountId}${path}`;

		try {
			return await fetch(url, {
				headers: { Authorization: `Zoho-oauthtoken ${connection.accessToken}` },
			});
		} catch (error) {
			// undici collapses every transport failure into "fetch failed". The actual
			// reason only exists on .cause — without this the log says nothing.
			const cause = (error as Error).cause;
			const detail =
				cause instanceof Error
					? `${cause.name}: ${cause.message}`
					: String(cause);

			this.logger.error(`Zoho transport failure on ${path} — ${detail}`);

			throw new ServiceUnavailableException(
				`Zoho transport failure: ${detail}`,
			);
		}
	}

	private async handle<T>(response: Response, path: string): Promise<T> {
		if (!response.ok) {
			this.logger.error(
				`Zoho API GET ${path} -> ${response.status}: ${await response.text()}`,
			);

			if (response.status === 401) {
				throw new UnauthorizedException('Zoho rejected the access token');
			}

			if (response.status === 429) {
				throw new ServiceUnavailableException('Zoho rate limit exceeded');
			}

			throw new BadGatewayException('Zoho API request failed');
		}

		return ((await response.json()) as { data: T }).data;
	}

	private view(start: number, limit: number): string {
		return `/messages/view?start=${start}&limit=${limit}&sortBy=date&sortorder=false`;
	}

	buildAuthorizationUrl(state: string): string {
		const params = new URLSearchParams({
			client_id: this.configService.get<string>('ZOHO_CLIENT_ID')!,
			redirect_uri: this.configService.get<string>('ZOHO_REDIRECT_URI')!,
			response_type: 'code',
			scope: SCOPES.join(','),
			access_type: 'offline',
			prompt: 'consent',
			state,
		});

		const home = this.configService.get<string>('ZOHO_ACCOUNTS_DOMAIN')!;

		return `${home}/oauth/v2/auth?${params.toString()}`;
	}

	/** Resolves a region against the table rather than building a URL from it. */
	private resolveLocation(location?: string): {
		key: string;
		accounts: string;
		mail: string;
	} {
		// No default region. Guessing one stores a routing decision that was never
		// discovered: the account connects successfully while pointing at the
		// wrong data centre for good.
		if (!location) {
			throw new BadRequestException(
				'Zoho did not return a location; start authorization at accounts.zoho.com',
			);
		}

		const key = (location ?? 'us').toLowerCase();
		const centre = DATA_CENTRES[key];

		if (!centre) {
			throw new BadRequestException(`Unknown Zoho data centre '${location}'`);
		}

		return { key, ...centre };
	}

	async exchangeCode(
		code: string,
		params: Record<string, string>,
	): Promise<ConnectResult> {
		const centre = this.resolveLocation(params.location);

		const payload = await this.postToken(centre.accounts, {
			code,
			redirect_uri: this.configService.get<string>('ZOHO_REDIRECT_URI')!,
			grant_type: 'authorization_code',
		});

		const tokens = this.toTokens(payload);
		const metadata: ProviderMetadata = { location: centre.key };

		return {
			tokens,
			metadata,
			identity: await this.fetchIdentity(centre.mail, tokens.accessToken),
		};
	}

	async refreshAccessToken(
		refreshToken: string,
		metadata: ProviderMetadata,
	): Promise<OAuthTokens> {
		const centre = this.resolveLocation(metadata.location);

		return this.toTokens(
			await this.postToken(centre.accounts, {
				refresh_token: refreshToken,
				grant_type: 'refresh_token',
			}),
		);
	}

	private async postToken(
		accountsDomain: string,
		fields: Record<string, string>,
	): Promise<ZohoTokenResponse> {
		const body = new URLSearchParams({
			...fields,
			client_id: this.configService.get<string>('ZOHO_CLIENT_ID')!,
			client_secret: this.configService.get<string>('ZOHO_CLIENT_SECRET')!,
		});

		const response = await fetch(`${accountsDomain}/oauth/v2/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
		});

		const payload = (await response.json()) as ZohoTokenResponse;

		// Zoho answers 200 OK with {"error":"invalid_code"}, so response.ok alone
		// is not enough to tell success from failure.
		if (!response.ok || payload.error || !payload.access_token) {
			this.logger.error(
				`Zoho token endpoint (${accountsDomain}) returned ${response.status}: ${payload.error ?? 'no access_token'}`,
			);
			throw new BadGatewayException('Could not complete Zoho authorization');
		}

		return payload;
	}

	private toTokens(payload: ZohoTokenResponse): OAuthTokens {
		return {
			accessToken: payload.access_token!,
			refreshToken: payload.refresh_token,
			expiresAt: new Date(Date.now() + (payload.expires_in ?? 3600) * 1000),
			scopes: payload.scope ? payload.scope.split(/[\s,]+/) : SCOPES,
		};
	}

	private async fetchIdentity(mailDomain: string, accessToken: string) {
		const response = await fetch(`${mailDomain}/api/accounts`, {
			headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
		});

		if (!response.ok) {
			this.logger.error(
				`Zoho accounts API returned ${response.status}: ${await response.text()}`,
			);
			throw new BadGatewayException('Could not read the Zoho account');
		}

		const account = ((await response.json()) as ZohoAccountsResponse).data?.[0];

		if (!account) {
			throw new BadGatewayException('Zoho returned no accounts');
		}

		return {
			providerAccountId: String(account.accountId),
			emailAddress: account.primaryEmailAddress,
		};
	}

	async getProfile(connection: ProviderConnection): Promise<ProviderProfile> {
		const centre = this.resolveLocation(connection.metadata.location);
		const identity = await this.fetchIdentity(
			centre.mail,
			connection.accessToken,
		);

		const path = this.view(1, 1);
		const [newest] = await this.handle<ZohoMessage[]>(
			await this.request(connection, path),
			path,
		);

		return {
			emailAddress: identity.emailAddress,
			// Zoho has no history log, so the cursor is a received-time watermark
			// taken from Zoho's own clock. Date.now() would let clock skew open a
			// permanent gap.
			cursor: newest?.receivedTime ?? '0',
		};
	}

	async listMessageIds(
		connection: ProviderConnection,
		{
			pageToken,
			maxResults = 100,
		}: { pageToken?: string; maxResults?: number },
	): Promise<MessageListPage> {
		const start = Number(pageToken ?? '1'); // Zoho's paging is 1-based.
		const limit = Math.min(maxResults, 200);
		const path = this.view(start, limit);

		const data = await this.handle<ZohoMessage[]>(
			await this.request(connection, path),
			path,
		);

		return {
			messageIds: data.map((message) => message.messageId),
			// Zoho pages by offset, not token. Opaque either way.
			nextPageToken: data.length === limit ? String(start + limit) : undefined,
		};
	}

	async listChangedMessageIds(
		connection: ProviderConnection,
		{ cursor, pageToken }: { cursor: string; pageToken?: string },
	): Promise<MessageChangePage> {
		const since = Number(cursor);
		const start = Number(pageToken ?? '1');
		const limit = 200;
		const path = this.view(start, limit);

		const data = await this.handle<ZohoMessage[]>(
			await this.request(connection, path),
			path,
		);

		// `>=` overlaps deliberately: two messages can share a millisecond. A repeat is
		// free under the unique constraint; a gap would be permanent and silent.
		const fresh = data.filter(
			(message) => Number(message.receivedTime) >= since,
		);

		return {
			messageIds: fresh.map((message) => message.messageId),
			// Stop the moment a page runs past the watermark.
			nextPageToken:
				fresh.length === data.length && data.length === limit
					? String(start + limit)
					: undefined,
			// Only page 1 holds the globally newest message — later pages are older,
			// and MailSyncService overwrites nextCursor whenever this is set.
			cursor: start === 1 ? data[0]?.receivedTime : undefined,
			// No cursorInvalid: a timestamp never expires. That case is Gmail's alone.
		};
	}

	async fetchRawMessage(
		connection: ProviderConnection,
		providerMessageId: string,
	): Promise<RawMessage | null> {
		const path = `/messages/${providerMessageId}/originalmessage`;
		const response = await this.request(connection, path);

		if (response.status === 404) {
			this.logger.warn(`Zoho message ${providerMessageId} no longer exists`);
			return null;
		}

		const data = await this.handle<{ messageId: number; content: string }>(
			response,
			path,
		);

		return {
			providerMessageId,
			labels: [],
			raw: Buffer.from(data.content, 'utf8'),
		};
	}
}
