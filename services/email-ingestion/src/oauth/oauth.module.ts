import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { OAuthController } from './oauth.controller.js';
import { OAuthStateService } from './oauth-state.service.js';

@Module({
	imports: [SecurityModule, MailModule, AccountsModule],
	controllers: [OAuthController],
	providers: [OAuthStateService],
})
export class OAuthModule {}
