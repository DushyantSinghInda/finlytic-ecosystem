import type { MailProvider } from '../../generated/prisma/client';

export interface OAuthTokens {
	accessToken: string;
	/** Absent when a provider only issues one on first consent. */
	refreshToken?: string;
	expiresAt: Date;
	scopes: string[];
}

export interface ProviderIdentity {
	/** Stable, provider-assigned account id — never the email address if avoidable. */
	providerAccountId: string;
	emailAddress: string;
}

export interface ConnectResult {
	tokens: OAuthTokens;
	identity: ProviderIdentity;
}

export interface MailProviderAdapter {
	readonly provider: MailProvider;

	buildAuthorizationUrl(state: string): string;
	exchangeCode(code: string): Promise<ConnectResult>;
	refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;
}
