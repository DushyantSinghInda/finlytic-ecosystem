import { createPublicKey, type KeyObject, verify } from 'node:crypto';
import type {
	AccessTokenPayload,
	AuthenticatedUser,
} from '@finlytic/shared-types';
import type { GatewayConfig } from './config.ts';

export class TokenError extends Error {}

function decodeSegment(segment: string): unknown {
	return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

// Parsing PEM per request costs 2.2x the verification itself (0.038ms vs
// 0.017ms measured). Keyed by the PEM so a different config re-parses — which
// is what lets the tests hand in their own key pair.
let cached: { pem: string; key: KeyObject } | undefined;

function publicKeyFor(pem: string): KeyObject {
	if (!cached || cached.pem !== pem) {
		cached = { pem, key: createPublicKey(pem) };
	}

	return cached.key;
}

export function verifyAccessToken(
	token: string,
	config: GatewayConfig,
): AuthenticatedUser {
	const parts = token.split('.');

	if (parts.length !== 3) {
		throw new TokenError('Malformed token');
	}

	const [headerSegment, payloadSegment, signatureSegment] = parts;
	const header = decodeSegment(headerSegment) as { alg?: string };

	// Pinned from OUR config, never read from the token. This single line is
	// what stops alg:"none" and RS256->HS256 confusion.
	if (header.alg !== 'RS256') {
		throw new TokenError(`Unexpected alg: ${String(header.alg)}`);
	}

	// The signature covers the raw `header.payload` ASCII exactly as it arrived.
	// Re-serialising the parsed objects would produce different bytes.
	const signed = Buffer.from(`${headerSegment}.${payloadSegment}`, 'ascii');

	const signatureValid = verify(
		'RSA-SHA256',
		signed,
		publicKeyFor(config.publicKey),
		Buffer.from(signatureSegment, 'base64url'),
	);

	if (!signatureValid) {
		throw new TokenError('Signature verification failed');
	}

	// Only now is the payload worth reading.
	const payload = decodeSegment(payloadSegment) as Partial<AccessTokenPayload>;
	const now = Math.floor(Date.now() / 1000);

	if (typeof payload.exp !== 'number' || payload.exp <= now) {
		throw new TokenError('Token expired');
	}

	if (payload.iss !== config.issuer) {
		throw new TokenError('Unexpected issuer');
	}

	if (payload.aud !== config.audience) {
		throw new TokenError('Unexpected audience');
	}

	if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
		throw new TokenError('Token missing sub or role');
	}

	return { id: payload.sub, role: payload.role };
}
