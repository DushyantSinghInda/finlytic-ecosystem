import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailProvider } from '../../generated/prisma/client';
import type {
	ConnectResult,
	MailProviderAdapter,
	OAuthTokens,
	ProviderIdentity,
} from './mail-provider.interface';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

const SCOPES = [
	'openid',
	'email',
	'https://www.googleapis.com/auth/gmail.readonly',
];

interface GoogleTokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	scope: string;
	token_type: string;
	id_token?: string;
}

@Injectable()
export class GmailProvider implements MailProviderAdapter {
	readonly provider = MailProvider.GMAIL;
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
}
