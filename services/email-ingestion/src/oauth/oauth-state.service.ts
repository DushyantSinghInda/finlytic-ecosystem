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

	/**
	 * Nonces already redeemed, held until they expire anyway.
	 *
	 * The signature proves a state was issued here; it does not prove it is
	 * being presented for the first time. Without this, a state observed in a
	 * redirect URL stays usable for its full ten minutes.
	 *
	 * In-process, like the gateway's rate limiter, and with the same caveat: a
	 * second instance would not see these. Redis is the fix if this ever runs
	 * more than once — the callback is already pinned to one host by the
	 * redirect URI, so it buys nothing today.
	 */
	private readonly redeemed = new Map<string, number>();

	constructor(configService: ConfigService) {
		this.secret = Buffer.from(
			configService.get<string>('OAUTH_STATE_SECRET')!,
			'base64',
		);
	}

	/** Drops entries whose state could no longer be accepted anyway. */
	private forget(now: number): void {
		for (const [nonce, exp] of this.redeemed) {
			if (exp < now) {
				this.redeemed.delete(nonce);
			}
		}
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

		const now = Math.floor(Date.now() / 1000);

		if (claims.exp < now) {
			throw new UnauthorizedException('OAuth state has expired');
		}

		this.forget(now);

		// Single use. A replayed state is either a stale back-button or someone
		// re-presenting a value they should not have; neither should connect a
		// mailbox to an account.
		if (this.redeemed.has(claims.nonce)) {
			throw new UnauthorizedException('OAuth state has already been used');
		}

		this.redeemed.set(claims.nonce, claims.exp);

		return claims.userId;
	}

	private sign(payload: string): string {
		return createHmac('sha256', this.secret)
			.update(payload)
			.digest('base64url');
	}
}
