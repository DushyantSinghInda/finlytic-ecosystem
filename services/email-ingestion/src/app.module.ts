import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AccountsModule } from './accounts/accounts.module';
import { CryptoModule } from './crypto/crypto.module';
import { OAuthModule } from './oauth/oauth.module';

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
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
