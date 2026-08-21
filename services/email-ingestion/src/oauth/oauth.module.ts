import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { MailModule } from '../mail/mail.module';
import { AccountsModule } from '../accounts/accounts.module';
import { OAuthController } from './oauth.controller';
import { OAuthStateService } from './oauth-state.service';

@Module({
	imports: [SecurityModule, MailModule, AccountsModule],
	controllers: [OAuthController],
	providers: [OAuthStateService],
})
export class OAuthModule {}
