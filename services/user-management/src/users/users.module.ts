import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersService } from './users.service';
import { AuthLibModule } from '@finlytic/auth-lib';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UsersController } from './users.controller';

@Module({
	imports: [
		PrismaModule,
		AuthLibModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				publicKey: readFileSync(
					resolve(config.get<string>('JWT_PUBLIC_KEY_PATH')!),
					'utf8',
				),
				issuer: config.get<string>('JWT_ISSUER')!,
				audience: config.get<string>('JWT_AUDIENCE')!,
			})
		})
	],
	controllers: [UsersController],
	providers: [UsersService],
	exports: [UsersService],
})
export class UsersModule { }
