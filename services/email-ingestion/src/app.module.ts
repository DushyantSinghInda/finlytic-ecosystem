import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AccountsModule } from './accounts/accounts.module';
import { CryptoModule } from './crypto/crypto.module';
import { OAuthModule } from './oauth/oauth.module';
import { StorageModule } from './storage/storage.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { QueueModule } from './queue/queue.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: '.env',
			validate: validateEnv,
		}),
		ThrottlerModule.forRoot({
			throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
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
