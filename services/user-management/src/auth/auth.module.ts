import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TokenService } from './token.service';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

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
  providers: [AuthService, TokenService, RefreshTokenService, JwtAuthGuard],
})
export class AuthModule {}
