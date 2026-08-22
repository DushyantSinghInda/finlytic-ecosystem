import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoModule } from '../crypto/crypto.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { MailModule } from '../mail/mail.module';
import { AccountTokenService } from './account-token.service';
import { QueueModule } from '../queue/queue.module';

@Module({
	imports: [
		SecurityModule,
		PrismaModule,
		CryptoModule,
		MailModule,
		QueueModule,
	],
	controllers: [AccountsController],
	providers: [AccountsService, AccountTokenService],
	exports: [AccountsService, AccountTokenService],
})
export class AccountsModule {}
