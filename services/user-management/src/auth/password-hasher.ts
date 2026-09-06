import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

const ARGON2_OPTIONS: argon2.HashOptions = {
	type: argon2.argon2id,
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1,
};

@Injectable()
export class PasswordHasher {
	hash(plainText: string): Promise<string> {
		return argon2.hash(plainText, ARGON2_OPTIONS);
	}

	// Returns false rather than throwing: a malformed digest is a failed
	// verification, not an error the caller has to handle.
	verify(digest: string, plainText: string): Promise<boolean> {
		return argon2.verify(digest, plainText).catch(() => false);
	}
}
