import {
	BadGatewayException,
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
	ProviderIdentity,
	ProviderProfile,
	RawMessage,
} from './mail-provider.interface';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

const API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

const GMAIL_READONLY = 'https://www.googleapis.com/auth/gmail.readonly';

const SCOPES = ['openid', 'email', GMAIL_READONLY];

interface GoogleTokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	scope: string;
	token_type: string;
	id_token?: string;
}

interface GmailProfileResponse {
	emailAddress: string;
	historyId: string;
}

interface GmailListResponse {
	messages?: { id: string; threadId: string }[];
	nextPageToken?: string;
}

interface GmailRawMessageResponse {
	id: string;
	threadId: string;
	labelIds?: string[];
	snippet?: string;
	sizeEstimate?: number;
	internalDate: string;
	raw: string;
}

interface GmailHistoryResponse {
	history?: {
		messagesAdded?: { message: { id: string } }[];
	}[];
	nextPageToken?: string;
	historyId?: string;
}

@Injectable()
export class GmailProvider implements MailProviderAdapter {
	readonly provider = MailProvider.GMAIL;
	readonly requiredScopes = [GMAIL_READONLY];
	private readonly logger = new Logger(GmailProvider.name);

	constructor(private readonly configService: ConfigService) {}

	buildAuthorizationUrl(state: string): string {
		const params = new URLSearchParams({
			client_id: this.configService.get<string>('GOOGLE_CLIENT_ID')!,
			redirect_uri: this.configService.get<string>('GOOGLE_REDIRECT_URI')!,
			response_type: 'code',
			scope: SCOPES.join(' '),
			access_type: 'offline',
			prompt: 'consent',
			include_granted_scopes: 'true',
			state,
		});

		return `${AUTH_ENDPOINT}?${params.toString()}`;
	}

	async exchangeCode(code: string): Promise<ConnectResult> {
		const payload = await this.postToken({
			code,
			redirect_uri: this.configService.get<string>('GOOGLE_REDIRECT_URI')!,
			grant_type: 'authorization_code',
		});

		return {
			tokens: this.toTokens(payload),
			identity: this.identityFromIdToken(payload.id_token),
		};
	}

	async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
		const payload = await this.postToken({
			refresh_token: refreshToken,
			grant_type: 'refresh_token',
		});

		return this.toTokens(payload);
	}

	private async postToken(
		fields: Record<string, string>,
	): Promise<GoogleTokenResponse> {
		const body = new URLSearchParams({
			...fields,
			client_id: this.configService.get<string>('GOOGLE_CLIENT_ID')!,
			client_secret: this.configService.get<string>('GOOGLE_CLIENT_SECRET')!,
		});

		const response = await fetch(TOKEN_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
		});

		if (!response.ok) {
			this.logger.error(
				`Google token endpoint returned ${response.status}: ${await response.text()}`,
			);
			throw new BadGatewayException('Could not complete Google authorization');
		}

		return (await response.json()) as GoogleTokenResponse;
	}

	private toTokens(payload: GoogleTokenResponse): OAuthTokens {
		return {
			accessToken: payload.access_token,
			refreshToken: payload.refresh_token,
			expiresAt: new Date(Date.now() + payload.expires_in * 1000),
			scopes: payload.scope.split(' '),
		};
	}

	private identityFromIdToken(idToken?: string): ProviderIdentity {
		if (!idToken) {
			throw new BadGatewayException('Google did not return an id_token');
		}

		const [, payloadPart] = idToken.split('.');
		const claims = JSON.parse(
			Buffer.from(payloadPart, 'base64url').toString(),
		) as { sub: string; email: string };

		return { providerAccountId: claims.sub, emailAddress: claims.email };
	}

	async getProfile(connection: ProviderConnection): Promise<ProviderProfile> {
		const data = await this.apiGet<GmailProfileResponse>(
			connection.accessToken,
			'/profile',
		);

		return { emailAddress: data.emailAddress, cursor: data.historyId };
	}

	async listMessageIds(
		connection: ProviderConnection,
		{
			pageToken,
			maxResults = 100,
		}: { pageToken?: string; maxResults?: number },
	): Promise<MessageListPage> {
		const params = new URLSearchParams({ maxResults: String(maxResults) });

		if (pageToken) {
			params.set('pageToken', pageToken);
		}

		const data = await this.apiGet<GmailListResponse>(
			connection.accessToken,
			`/messages?${params.toString()}`,
		);

		return {
			messageIds: (data.messages ?? []).map((message) => message.id),
			nextPageToken: data.nextPageToken,
		};
	}

	async fetchRawMessage(
		connection: ProviderConnection,
		providerMessageId: string,
	): Promise<RawMessage | null> {
		const path = `/messages/${providerMessageId}?format=RAW`;
		const response = await this.request(connection.accessToken, path);

		if (response.status === 404) {
			this.logger.warn(`Gmail message ${providerMessageId} no longer exists`);
			return null;
		}

		const data = await this.handle<GmailRawMessageResponse>(response, path);

		return {
			providerMessageId: data.id,
			providerThreadId: data.threadId,
			labels: data.labelIds ?? [],
			snippet: data.snippet,
			sizeBytes: data.sizeEstimate,
			internalDate: new Date(Number(data.internalDate)),
			raw: Buffer.from(data.raw, 'base64url'),
		};
	}

	async listChangedMessageIds(
		connection: ProviderConnection,
		{ cursor, pageToken }: { cursor: string; pageToken?: string },
	): Promise<MessageChangePage> {
		const params = new URLSearchParams({
			startHistoryId: cursor,
			historyTypes: 'messageAdded',
		});

		if (pageToken) {
			params.set('pageToken', pageToken);
		}

		const path = `/history?${params.toString()}`;
		const response = await this.request(connection.accessToken, path);

		if (response.status === 404) {
			this.logger.warn(`Gmail history cursor ${cursor} is no longer valid`);
			return { messageIds: [], cursorInvalid: true };
		}

		const data = await this.handle<GmailHistoryResponse>(response, path);

		const messageIds = (data.history ?? []).flatMap((entry) =>
			(entry.messagesAdded ?? []).map((added) => added.message.id),
		);

		return {
			messageIds,
			nextPageToken: data.nextPageToken,
			cursor: data.historyId,
		};
	}

	private request(accessToken: string, path: string): Promise<Response> {
		return fetch(`${API_BASE}${path}`, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
	}

	private async handle<T>(response: Response, path: string): Promise<T> {
		if (!response.ok) {
			this.logger.error(
				`Gmail API GET ${path} -> ${response.status}: ${await response.text()}`,
			);

			if (response.status === 401) {
				throw new UnauthorizedException('Gmail rejected the access token');
			}

			if (response.status === 429 || response.status === 403) {
				throw new ServiceUnavailableException('Gmail rate limit exceeded');
			}

			throw new BadGatewayException('Gmail API request failed');
		}

		return (await response.json()) as T;
	}

	private async apiGet<T>(accessToken: string, path: string): Promise<T> {
		return this.handle<T>(await this.request(accessToken, path), path);
	}
}
