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

	fetchRawMessage(
		accessToken: string,
		providerMessageId: string,
	): Promise<RawMessage>;
}
