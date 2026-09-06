import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TokenService } from './token.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PasswordHasher } from './password-hasher.js';

@Module({
	imports: [
		UsersModule,
		PrismaModule,
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService): JwtModuleOptions => ({
				privateKey: readFileSync(
					resolve(config.get<string>('JWT_PRIVATE_KEY_PATH')!),
					'utf8',
				),
				publicKey: readFileSync(
					resolve(config.get<string>('JWT_PUBLIC_KEY_PATH')!),
					'utf8',
				),
				signOptions: {
					algorithm: 'RS256',
					expiresIn: config.get<number>('JWT_ACCESS_TOKEN_TTL_SECONDS'),
					issuer: config.get<string>('JWT_ISSUER'),
					audience: config.get<string>('JWT_AUDIENCE'),
				},
				verifyOptions: {
					algorithms: ['RS256'],
					issuer: config.get<string>('JWT_ISSUER'),
					audience: config.get<string>('JWT_AUDIENCE'),
				},
			}),
		}),
	],
	controllers: [AuthController],
	providers: [AuthService, TokenService, RefreshTokenService, PasswordHasher],
})
export class AuthModule {}
