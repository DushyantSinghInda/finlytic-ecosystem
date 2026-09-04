import { z } from 'zod';

export const envSchema = z.object({
	NODE_ENV: z
		.enum(['development', 'test', 'production'])
		.default('development'),
	PORT: z.coerce.number().int().positive().default(3002),

	JWT_PUBLIC_KEY_PATH: z.string().min(1),
	JWT_ISSUER: z.string().min(1),
	JWT_AUDIENCE: z.string().min(1),

	DATABASE_URL: z
		.string()
		.startsWith('postgresql://', 'must be a postgresql:// URL'),

	ENCRYPTION_KEY: z
		.string()
		.refine(
			(value) => Buffer.from(value, 'base64').length === 32,
			'must be 32 bytes, base64-encoded (AES-256)',
		),

	GOOGLE_CLIENT_ID: z.string().min(1),
	GOOGLE_CLIENT_SECRET: z.string().min(1),
	GOOGLE_REDIRECT_URI: z.string().startsWith('http'),

	ZOHO_CLIENT_ID: z.string().min(1),
	ZOHO_CLIENT_SECRET: z.string().min(1),
	ZOHO_REDIRECT_URI: z.string().startsWith('http'),
	ZOHO_ACCOUNTS_DOMAIN: z.string().startsWith('https://accounts.zoho.'),

	OAUTH_STATE_SECRET: z
		.string()
		.refine(
			(value) => Buffer.from(value, 'base64').length >= 32,
			'must be at least 32 bytes, base64-encoded',
		),

	S3_ENDPOINT: z.string().startsWith('http'),
	S3_REGION: z.string().min(1),
	S3_BUCKET: z.string().min(1),
	S3_ACCESS_KEY_ID: z.string().min(1),
	S3_SECRET_ACCESS_KEY: z.string().min(1),

	REDIS_HOST: z.string().min(1),
	REDIS_PORT: z.coerce.number().int().positive().default(6379),
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
