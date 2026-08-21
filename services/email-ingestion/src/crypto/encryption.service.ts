import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const VERSION = 'v1';

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

	encrypt(plainText: string): string {
		const nonce = randomBytes(NONCE_BYTES);
		const cipher = createCipheriv(ALGORITHM, this.key, nonce);

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

	decrypt(envelope: string): string {
		const [version, noncePart, tagPart, cipherTextPart] = envelope.split('.');

		if (version !== VERSION || !noncePart || !tagPart || !cipherTextPart) {
			throw new Error('Malformed ciphertext envelope ');
		}

		const decipher = createDecipheriv(
			ALGORITHM,
			this.key,
			Buffer.from(noncePart, 'base64url'),
		);
		decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

		return Buffer.concat([
			decipher.update(Buffer.from(cipherTextPart, 'base64url')),
			decipher.final(),
		]).toString('utf8');
	}
}
