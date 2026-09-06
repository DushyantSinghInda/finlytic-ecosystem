import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { OAuthModule } from './oauth/oauth.module.js';
import { StorageModule } from './storage/storage.module.js';
import { QueueModule } from './queue/queue.module.js';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: '.env',
			validate: validateEnv,
		}),
		PrismaModule,
		CryptoModule,
		AccountsModule,
		OAuthModule,
		StorageModule,
		QueueModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
