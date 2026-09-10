import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const VERSION = 'v2';

/**
 * What a ciphertext is *for*, bound into the authentication tag.
 *
 * Without it, every envelope under this key is interchangeable: anyone able to
 * write to the database could copy an access-token ciphertext into the refresh
 * column, or move one between accounts, and GCM would happily authenticate it —
 * the bytes really were produced by this key. AAD makes the tag depend on the
 * purpose too, so a moved ciphertext fails to authenticate.
 */
export type CipherPurpose = 'access' | 'refresh' | 'probe';

@Injectable()
export class EncryptionService {
	private readonly key: Buffer;

	constructor(configService: ConfigService) {
		this.key = Buffer.from(
			configService.get<string>('ENCRYPTION_KEY')!,
			'base64',
		);

		if (this.key.length !== 32) {
			throw new Error(
				`ENCRYPTION_KEY must decode to 32 bytes, got ${this.key.length}`,
			);
		}
	}

	encrypt(plainText: string, purpose: CipherPurpose): string {
		const nonce = randomBytes(NONCE_BYTES);
		const cipher = createCipheriv(ALGORITHM, this.key, nonce);

		cipher.setAAD(Buffer.from(purpose, 'utf8'));

		const cipherText = Buffer.concat([
			cipher.update(plainText, 'utf8'),
			cipher.final(),
		]);

		return [
			VERSION,
			nonce.toString('base64url'),
			cipher.getAuthTag().toString('base64url'),
			cipherText.toString('base64url'),
		].join('.');
	}

	decrypt(envelope: string, purpose: CipherPurpose): string {
		const [version, noncePart, tagPart, cipherTextPart] = envelope.split('.');

		if (!noncePart || !tagPart || !cipherTextPart) {
			throw new Error('Malformed ciphertext envelope');
		}

		// v1 predates AAD. Rows written before this change must keep decrypting —
		// there is no migration, they are re-encrypted as v2 the next time their
		// token is refreshed. Reject anything that is neither.
		if (version !== 'v1' && version !== VERSION) {
			throw new Error(`Unsupported ciphertext version: ${String(version)}`);
		}

		const decipher = createDecipheriv(
			ALGORITHM,
			this.key,
			Buffer.from(noncePart, 'base64url'),
		);

		if (version === VERSION) {
			decipher.setAAD(Buffer.from(purpose, 'utf8'));
		}

		decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

		return Buffer.concat([
			decipher.update(Buffer.from(cipherTextPart, 'base64url')),
			decipher.final(),
		]).toString('utf8');
	}
}
