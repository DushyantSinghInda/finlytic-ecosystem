import {
	BadRequestException,
	Controller,
	Get,
	Param,
	Query,
	UseGuards,
} from '@nestjs/common';
import {
	CurrentUser,
	JwtAuthGuard,
	type AuthenticatedUser,
} from '@finlytic/auth-lib';
import { MailProviderRegistry } from '../mail/mail-provider.registry';
import { AccountsService } from '../accounts/accounts.service';
import { OAuthStateService } from './oauth-state.service';

@Controller('oauth/:provider')
export class OAuthController {
	constructor(
		private readonly registry: MailProviderRegistry,
		private readonly oauthState: OAuthStateService,
		private readonly accountsService: AccountsService,
	) {}

	@Get('authorize')
	@UseGuards(JwtAuthGuard)
	authorize(
		@Param('provider') slug: string,
		@CurrentUser() user: AuthenticatedUser,
	): { authorizationUrl: string } {
		const { adapter } = this.registry.resolve(slug);
		const state = this.oauthState.issue(user.id);

		return { authorizationUrl: adapter.buildAuthorizationUrl(state) };
	}

	@Get('callback')
	async callback(
		@Param('provider') slug: string,
		@Query('code') code?: string,
		@Query('state') state?: string,
		@Query('error') error?: string,
	) {
		const { provider, adapter } = this.registry.resolve(slug);

		if (error) {
			throw new BadRequestException(
				`${provider} declined the request: ${error}`,
			);
		}

		if (!code || !state) {
			throw new BadRequestException('Missing code or state');
		}

		const userId = this.oauthState.verify(state);
		const result = await adapter.exchangeCode(code);
		const account = await this.accountsService.connect(
			userId,
			provider,
			result,
		);

		return {
			connected: true,
			provider: account.provider,
			accountId: account.id,
			emailAddress: account.emailAddress,
			scopes: account.scopes,
			hasRefreshToken: account.refreshTokenEnc !== null,
		};
	}
}
