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

export interface MessageChangePage {
	messageIds: string[];
	nextPageToken?: string;
	/** New cursor to persist once this page set is ingested. */
	cursor?: string;
	/** Provider can no longer answer from the supplied cursor — fall back to a fresh sync. */
	cursorInvalid?: boolean;
}

export interface MessageListPage {
	messageIds: string[];
	nextPageToken?: string;
}

export interface RawMessage {
	providerMessageId: string;
	providerThreadId?: string;
	labels: string[];
	snippet?: string;
	sizeBytes?: number;
	/** When the provider received it. */
	internalDate: Date;
	/** The complete original RFC-822 message. */
	raw: Buffer;
}

export interface ProviderProfile {
	emailAddress: string;
	/** Opaque provider cursor for incremental sync. */
	cursor: string;
}

export interface MailProviderAdapter {
	readonly provider: MailProvider;
	/**
			 * Scopes the service cannot function without, in the exact form the provider
			 * RETURNS them — not necessarily the form we request. Google turns a request
			 * for 'email' into 'https://www.googleapis.com/auth/userinfo.email'.
			 */
	readonly requiredScopes: string[];

	buildAuthorizationUrl(state: string): string;
	exchangeCode(code: string): Promise<ConnectResult>;
	refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;

	getProfile(accessToken: string): Promise<ProviderProfile>;

	listMessageIds(
		accessToken: string,
		options: { pageToken?: string; maxResults?: number },
	): Promise<MessageListPage>;

	listChangedMessageIds(
		accessToken: string,
		options: { cursor: string; pageToken?: string },
	): Promise<MessageChangePage>;

	/**
			 * Returns null when the provider no longer has the message. Not an error:
			 * the id came from a log of what happened, not a snapshot of what exists.
			 */
	fetchRawMessage(
		accessToken: string,
		providerMessageId: string,
	): Promise<RawMessage | null>;
}
