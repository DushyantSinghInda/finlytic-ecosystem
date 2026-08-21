import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STATE_TTL_SECONDS = 600;

interface StateClaims {
	userId: string;
	nonce: string;
	exp: number;
}

@Injectable()
export class OAuthStateService {
	private readonly secret: Buffer;

	constructor(configService: ConfigService) {
		this.secret = Buffer.from(
			configService.get<string>('OAUTH_STATE_SECRET')!,
			'base64',
		);
	}

	issue(userId: string): string {
		const claims: StateClaims = {
			userId,
			nonce: randomBytes(16).toString('base64url'),
			exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
		};

		const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
		return `${payload}.${this.sign(payload)}`;
	}

	verify(state: string): string {
		const [payload, signature] = state.split('.');

		if (!payload || !signature) {
			throw new UnauthorizedException('Malformed OAuth state');
		}

		const provided = Buffer.from(signature);
		const expected = Buffer.from(this.sign(payload));

		if (
			provided.length !== expected.length ||
			!timingSafeEqual(provided, expected)
		) {
			throw new UnauthorizedException('Invalid OAuth state');
		}

		const claims = JSON.parse(
			Buffer.from(payload, 'base64url').toString(),
		) as StateClaims;

		if (claims.exp < Math.floor(Date.now() / 1000)) {
			throw new UnauthorizedException('OAuth state has expired');
		}

		return claims.userId;
	}

	private sign(payload: string): string {
		return createHmac('sha256', this.secret)
			.update(payload)
			.digest('base64url');
	}
}
