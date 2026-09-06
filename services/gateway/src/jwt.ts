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

// Parsing the PEM costs 0.038ms against 0.017ms for the verification itself, so
// the parsed key is held. Keyed by the PEM text, so a different config re-parses.
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

	// The algorithm comes from config, never from the token. Without this,
	// alg:"none" verifies an empty signature, and alg:"HS256" makes the RSA
	// public key usable as an HMAC secret — it is public, so anyone could sign.
	if (header.alg !== 'RS256') {
		throw new TokenError(`Unexpected alg: ${String(header.alg)}`);
	}

	// The signature covers the raw `header.payload` ASCII as it arrived.
	// Re-serialising the parsed objects produces different bytes.
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

	// Claims are only trustworthy once the signature checks out.
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
