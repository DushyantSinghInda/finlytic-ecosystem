import {
	BadGatewayException,
	BadRequestException,
	Injectable,
	Logger,
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
 * Zoho runs independent data centres. A refresh token issued by one is worthless
 * at another. This map is also the ALLOWLIST — `location` arrives via a browser
 * redirect, so it must select a known row, never construct a URL.
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
	/** Zoho reports OAuth failures in the BODY of a 200 response. */
	error?: string;
}

interface ZohoAccountsResponse {
	data?: { accountId: string; primaryEmailAddress: string }[];
}

@Injectable()
export class ZohoProvider implements MailProviderAdapter {
	readonly provider = MailProvider.ZOHO;
	readonly requiredScopes = SCOPES;

	private readonly logger = new Logger(ZohoProvider.name);

	constructor(private readonly configService: ConfigService) {}

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

	/** Never build a URL from the callback — look the region up in the table. */
	private resolveLocation(location?: string): {
		key: string;
		accounts: string;
		mail: string;
	} {
		// No default. An unknown region must fail loudly — guessing it stores a
		// routing decision that was never discovered, and the account still
		// "connects" while being permanently pointed at the wrong data centre.
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

		// Zoho answers 200 OK with {"error":"invalid_code"} — response.ok lies.
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

	// --- 7c-ii(b) ---

	getProfile(_connection: ProviderConnection): Promise<ProviderProfile> {
		throw new Error('ZohoProvider.getProfile not implemented');
	}

	listMessageIds(
		_connection: ProviderConnection,
		_options: { pageToken?: string; maxResults?: number },
	): Promise<MessageListPage> {
		throw new Error('ZohoProvider.listMessageIds not implemented');
	}

	listChangedMessageIds(
		_connection: ProviderConnection,
		_options: { cursor: string; pageToken?: string },
	): Promise<MessageChangePage> {
		throw new Error('ZohoProvider.listChangedMessageIds not implemented');
	}

	fetchRawMessage(
		_connection: ProviderConnection,
		_providerMessageId: string,
	): Promise<RawMessage | null> {
		throw new Error('ZohoProvider.fetchRawMessage not implemented');
	}
}
