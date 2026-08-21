import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthLibModule } from '@finlytic/auth-lib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const authLib = AuthLibModule.forRootAsync({
	inject: [ConfigService],
	useFactory: (config: ConfigService) => ({
		publicKey: readFileSync(
			resolve(config.get<string>('JWT_PUBLIC_KEY_PATH')!),
			'utf8',
		),
		issuer: config.get<string>('JWT_ISSUER')!,
		audience: config.get<string>('JWT_AUDIENCE')!,
	}),
});

@Module({
	imports: [authLib],
	exports: [authLib],
})
export class SecurityModule {}
