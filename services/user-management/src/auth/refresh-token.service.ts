import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshToken } from '../generated/prisma/client';

export interface ClientMeta {
	ipAddress?: string;
	userAgent?: string;
}

export interface IssuedRefreshToken {
	raw: string;
	record: RefreshToken;
}

@Injectable()
export class RefreshTokenService {
	private readonly logger = new Logger(RefreshTokenService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly configService: ConfigService,
	) { }

	private fingerprint(rawToken: string): string {
		return createHash('sha256').update(rawToken).digest('hex');
	}

	async issue(
		userId: string,
		familyId: string,
		meta: ClientMeta,
	): Promise<IssuedRefreshToken> {
		const raw = randomBytes(32).toString('base64url');
		const days = this.configService.get<number>('JWT_REFRESH_TOKEN_TTL_DAYS')!;

		const record = await this.prisma.refreshToken.create({
			data: {
				userId,
				familyId,
				tokenHash: this.fingerprint(raw),
				expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
				ipAddress: meta.ipAddress,
				userAgent: meta.userAgent,
			},
		});

		return { raw, record };
	}

	startFamily(userId: string, meta: ClientMeta): Promise<IssuedRefreshToken> {
		return this.issue(userId, randomUUID(), meta);
	}

	/**
	 * Atomically spend a refresh token.
	 * Returns the spent record, or null if it was invalid, expired or already used.
	 * Replaying an already-spent token revokes its entire family.
	 */
	async spend(rawToken: string): Promise<RefreshToken | null> {
		const tokenHash = this.fingerprint(rawToken);
		const now = new Date();

		const { count } = await this.prisma.refreshToken.updateMany({
			where: { tokenHash, expiresAt: { gt: now } },
			data: { revokedAt: now },
		});

		if (count === 1) {
			return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
		}

		const existing = await this.prisma.refreshToken.findUnique({
			where: { tokenHash },
		});

		if (existing?.revokedAt) {
			this.logger.error(
				`Refresh token reuse detected — revoking family ${existing.familyId} (user ${existing.userId})`,
			);
			await this.revokeFamily(existing.familyId);
		}

		return null;
	}

	async linkReplacement(spentId: string, replacementId: string): Promise<void> {
		await this.prisma.refreshToken.update({
			where: { id: spentId },
			data: { replacedById: replacementId },
		});
	}

	async revokeFamily(familyId: string): Promise<void> {
		await this.prisma.refreshToken.updateMany({
			where: { familyId, revokedAt: null },
			data: { revokedAt: new Date() },
		});
	}

	async revokeFamilyByToken(rawToken: string): Promise<void> {
		const record = await this.prisma.refreshToken.findUnique({
			where: { tokenHash: this.fingerprint(rawToken) },
		});

		if (record) {
			await this.revokeFamily(record.familyId);
		}
	}
}
