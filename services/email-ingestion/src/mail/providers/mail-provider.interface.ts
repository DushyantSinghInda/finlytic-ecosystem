import type { MailProvider } from '../../generated/prisma/client';

/** Opaque provider-specific context, persisted per account. */
export type ProviderMetadata = Record<string, string>;

/** Everything an adapter needs to make one authenticated call. */
export interface ProviderConnection {
	accessToken: string;
	providerAccountId: string;
	metadata: ProviderMetadata;
}

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
	/** Routing context to persist. Gmail returns none; Zoho returns its data centre. */
	metadata?: ProviderMetadata;
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
	/** When the provider received it, if it says. The MIME Date header is authoritative. */
	internalDate?: Date;
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
	/**
	 * `params` is every query parameter the provider appended to the redirect.
	 * Gmail needs only `code`; Zoho reads its data centre from `accounts-server`.
	 */
	exchangeCode(
		code: string,
		params: Record<string, string>,
	): Promise<ConnectResult>;

	refreshAccessToken(
		refreshToken: string,
		metadata: ProviderMetadata,
	): Promise<OAuthTokens>;

	getProfile(connection: ProviderConnection): Promise<ProviderProfile>;

	listMessageIds(
		connection: ProviderConnection,
		options: { pageToken?: string; maxResults?: number },
	): Promise<MessageListPage>;

	listChangedMessageIds(
		connection: ProviderConnection,
		options: { cursor: string; pageToken?: string },
	): Promise<MessageChangePage>;

	/**
	 * Returns null when the provider no longer has the message. Not an error:
	 * the id came from a log of what happened, not a snapshot of what exists.
	 */
	fetchRawMessage(
		connection: ProviderConnection,
		providerMessageId: string,
	): Promise<RawMessage | null>;
}
