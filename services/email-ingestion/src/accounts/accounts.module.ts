import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CryptoModule } from '../crypto/crypto.module.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { MailModule } from '../mail/mail.module.js';
import { AccountTokenService } from './account-token.service.js';
import { QueueModule } from '../queue/queue.module.js';

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
