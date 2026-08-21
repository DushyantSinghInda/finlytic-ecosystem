import { Module, type DynamicModule, type ModuleMetadata } from "@nestjs/common";
import type { AuthLibOptions } from "./types";
import { JwtModule } from "@nestjs/jwt";
import { JwtAuthGuard } from "./jwt-auth.guard";

export interface AuthLibAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
	inject?: any[];
	useFactory: (...args: any[]) => AuthLibOptions | Promise<AuthLibOptions>;
}

@Module({})
export class AuthLibModule {
	static forRootAsync(options: AuthLibAsyncOptions): DynamicModule {
		const jwtModule = JwtModule.registerAsync({
			imports: options.imports ?? [],
			inject: options.inject ?? [],
			useFactory: async (...args: any[]) => {
				const { publicKey, issuer, audience } = await options.useFactory(...args);

				return {
					publicKey,
					verifyOptions: {
						algorithms: ['RS256'],
						issuer,
						audience,
					},
				};
			},
		});

		return {
			module: AuthLibModule,
			imports: [jwtModule],
			providers: [JwtAuthGuard],
			exports: [JwtAuthGuard, jwtModule],
		};
	}
}