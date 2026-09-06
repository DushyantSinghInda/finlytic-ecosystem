import { randomBytes } from 'node:crypto';
import { EncryptionService } from './encryption.service';
import type { ConfigService } from '@nestjs/config';

function buildService(keyBase64 = randomBytes(32).toString('base64')) {
	const configService = { get: () => keyBase64 } as unknown as ConfigService;

	return new EncryptionService(configService);
}

describe('EncryptionService', () => {
	it('round-trips a token', () => {
		const service = buildService();
		const secret = 'ya29.a0AfH6SMB-not-a-real-token';

		expect(service.decrypt(service.encrypt(secret))).toBe(secret);
	});

	it('writes a versioned four-part envelope', () => {
		const parts = buildService().encrypt('token').split('.');

		expect(parts).toHaveLength(4);
		// The prefix is what makes key rotation possible: v2 rows can sit beside
		// v1 rows, and every row says how to read itself.
		expect(parts[0]).toBe('v1');
	});

	it('never produces the same ciphertext twice', () => {
		const service = buildService();

		// Fresh nonce per call. Deterministic encryption would leak which two
		// accounts share a token without decrypting anything.
		expect(service.encrypt('token')).not.toBe(service.encrypt('token'));
	});

	it('refuses to decrypt a tampered ciphertext', () => {
		const service = buildService();
		const [version, nonce, tag, cipherText] = service
			.encrypt('token')
			.split('.');
		const flipped = (cipherText[0] === 'A' ? 'B' : 'A') + cipherText.slice(1);

		// GCM authenticates as well as encrypts. CBC would have decrypted this
		// into garbage and handed the garbage back as a token.
		expect(() =>
			service.decrypt([version, nonce, tag, flipped].join('.')),
		).toThrow();
	});

	it('cannot read a row encrypted under a different key', () => {
		const envelope = buildService().encrypt('token');

		// A round trip succeeds under the wrong key too, so only a second key
		// shows the key is load-bearing.
		expect(() => buildService().decrypt(envelope)).toThrow();
	});

	it('rejects a key that is not 32 bytes', () => {
		expect(() => buildService(randomBytes(16).toString('base64'))).toThrow(
			'ENCRYPTION_KEY must decode to 32 bytes, got 16',
		);
	});
});
