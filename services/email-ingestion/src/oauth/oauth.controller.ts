import {
	BadRequestException,
	Controller,
	Get,
	Query,
	UseGuards,
} from '@nestjs/common';
import {
	CurrentUser,
	JwtAuthGuard,
	type AuthenticatedUser,
} from '@finlytic/auth-lib';
import { GmailProvider } from '../mail/providers/gmail.provider';
import { AccountsService } from '../accounts/accounts.service';
import { OAuthStateService } from './oauth-state.service';
import { MailProvider } from '../generated/prisma/client';

@Controller('oauth/gmail')
export class OAuthController {
	constructor(
		private readonly gmailProvider: GmailProvider,
		private readonly oauthState: OAuthStateService,
		private readonly accountsService: AccountsService,
	) {}

	@Get('authorize')
	@UseGuards(JwtAuthGuard)
	authorize(@CurrentUser() user: AuthenticatedUser): {
		authorizationUrl: string;
	} {
		const state = this.oauthState.issue(user.id);

		return {
			authorizationUrl: this.gmailProvider.buildAuthorizationUrl(state),
		};
	}

	@Get('callback')
	async callback(
		@Query('code') code?: string,
		@Query('state') state?: string,
		@Query('error') error?: string,
	) {
		if (error) {
			throw new BadRequestException(`Google declined the request: ${error}`);
		}

		if (!code || !state) {
			throw new BadRequestException('Missing code or state');
		}

		const userId = this.oauthState.verify(state);
		const result = await this.gmailProvider.exchangeCode(code);
		const account = await this.accountsService.connect(
			userId,
			MailProvider.GMAIL,
			result,
		);

		return {
			connected: true,
			accountId: account.id,
			emailAddress: account.emailAddress,
			scopes: account.scopes,
			hasRefreshToken: account.refreshTokenEnc !== null,
		};
	}
}
