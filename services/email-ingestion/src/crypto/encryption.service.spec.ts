import { createCipheriv, randomBytes } from 'node:crypto';
import { EncryptionService } from './encryption.service.js';
import type { ConfigService } from '@nestjs/config';

function buildService(keyBase64 = randomBytes(32).toString('base64')) {
	const configService = { get: () => keyBase64 } as unknown as ConfigService;

	return new EncryptionService(configService);
}

/** A v1 envelope — no AAD — as written before the purpose binding existed. */
function legacyEnvelope(keyBase64: string, plainText: string): string {
	const key = Buffer.from(keyBase64, 'base64');
	const nonce = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, nonce);

	const cipherText = Buffer.concat([
		cipher.update(plainText, 'utf8'),
		cipher.final(),
	]);

	return [
		'v1',
		nonce.toString('base64url'),
		cipher.getAuthTag().toString('base64url'),
		cipherText.toString('base64url'),
	].join('.');
}

describe('EncryptionService', () => {
	it('round-trips a token', () => {
		const service = buildService();
		const secret = 'ya29.a0AfH6SMB-not-a-real-token';

		expect(service.decrypt(service.encrypt(secret, 'access'), 'access')).toBe(
			secret,
		);
	});

	it('writes a versioned four-part envelope', () => {
		const parts = buildService().encrypt('token', 'access').split('.');

		expect(parts).toHaveLength(4);
		// The prefix is what makes rotation possible: v2 rows sit beside v1 rows
		// and every row says how to read itself.
		expect(parts[0]).toBe('v2');
	});

	it('never produces the same ciphertext twice', () => {
		const service = buildService();

		// Fresh nonce per call. Deterministic encryption would leak which two
		// accounts share a token without decrypting anything.
		expect(service.encrypt('token', 'access')).not.toBe(
			service.encrypt('token', 'access'),
		);
	});

	it('refuses to decrypt a tampered ciphertext', () => {
		const service = buildService();
		const [version, nonce, tag, cipherText] = service
			.encrypt('token', 'access')
			.split('.');
		const flipped = (cipherText[0] === 'A' ? 'B' : 'A') + cipherText.slice(1);

		// GCM authenticates as well as encrypts. CBC would have decrypted this
		// into garbage and handed the garbage back as a token.
		expect(() =>
			service.decrypt([version, nonce, tag, flipped].join('.'), 'access'),
		).toThrow();
	});

	it('cannot read a row encrypted under a different key', () => {
		const envelope = buildService().encrypt('token', 'access');

		// A round trip succeeds under the wrong key too, so only a second key
		// shows the key is load-bearing.
		expect(() => buildService().decrypt(envelope, 'access')).toThrow();
	});

	it('refuses a ciphertext moved to a different purpose', () => {
		const service = buildService();
		const accessEnvelope = service.encrypt('token', 'access');

		// The point of the AAD. Anyone able to write to the database could
		// otherwise copy this value into refresh_token_enc and GCM would
		// authenticate it — the bytes really were produced by this key.
		expect(() => service.decrypt(accessEnvelope, 'refresh')).toThrow();
	});

	it('still reads a v1 row written before purposes existed', () => {
		const keyBase64 = randomBytes(32).toString('base64');
		const service = buildService(keyBase64);
		const envelope = legacyEnvelope(keyBase64, 'legacy-token');

		// There is no migration: existing rows must keep working and are
		// re-encrypted as v2 the next time their token is refreshed.
		expect(service.decrypt(envelope, 'access')).toBe('legacy-token');
	});

	it('rejects an envelope claiming an unknown version', () => {
		const service = buildService();
		const parts = service.encrypt('token', 'access').split('.');

		expect(() =>
			service.decrypt(['v9', ...parts.slice(1)].join('.'), 'access'),
		).toThrow('Unsupported ciphertext version: v9');
	});

	it('rejects a key that is not 32 bytes', () => {
		expect(() => buildService(randomBytes(16).toString('base64'))).toThrow(
			'ENCRYPTION_KEY must decode to 32 bytes, got 16',
		);
	});
});
