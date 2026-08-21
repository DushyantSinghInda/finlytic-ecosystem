import { z } from 'zod';

export const envSchema = z.object({
	NODE_ENV: z
		.enum(['development', 'test', 'production'])
		.default('development'),
	PORT: z.coerce.number().int().positive().default(3001),

	DATABASE_URL: z
		.string()
		.startsWith('postgresql://', 'must be a postgresql:// URL'),

	JWT_PRIVATE_KEY_PATH: z.string().min(1),
	JWT_PUBLIC_KEY_PATH: z.string().min(1),
	JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
	JWT_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
	JWT_ISSUER: z.string().min(1),
	JWT_AUDIENCE: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
	const result = envSchema.safeParse(raw);

	if (!result.success) {
		const details = result.error.issues
			.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
			.join('\n');
		throw new Error(`Invalid environment configuration:\n${details}`);
	}

	return result.data;
}
