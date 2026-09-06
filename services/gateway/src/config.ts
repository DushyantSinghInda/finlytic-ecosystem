import { readFileSync } from 'node:fs';

export interface GatewayConfig {
	port: number;
	publicKey: string;
	issuer: string;
	audience: string;
	userManagementUrl: string;
	emailIngestionUrl: string;
}

function required(name: string): string {
	const value = process.env[name];

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

export function loadConfig(): GatewayConfig {
	// Read and validated here so a bad value fails at boot rather than on the
	// first request that needs it. A wrong key path is a startup crash, not a
	// 500 an hour later.
	return {
		port: Number(process.env.PORT ?? 3000),
		publicKey: readFileSync(required('JWT_PUBLIC_KEY_PATH'), 'utf8'),
		issuer: required('JWT_ISSUER'),
		audience: required('JWT_AUDIENCE'),
		userManagementUrl: required('USER_MANAGEMENT_URL'),
		emailIngestionUrl: required('EMAIL_INGESTION_URL'),
	};
}
