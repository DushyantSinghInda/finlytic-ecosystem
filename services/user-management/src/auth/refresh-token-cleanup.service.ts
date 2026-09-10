import {
	Injectable,
	Logger,
	type OnModuleDestroy,
	type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Deletes refresh tokens that can no longer be presented.
 *
 * The table gains a row per login and per refresh and nothing ever removed one,
 * so it grows without bound for the life of the deployment.
 *
 * **Only expired rows go.** A revoked-but-unexpired row still has a job: it is
 * what turns a replayed token into a detected reuse rather than an unknown
 * token. Delete those early and a stolen token stops revoking its family
 * (rule 6) and starts looking like an ordinary invalid one.
 *
 * A plain interval rather than @nestjs/schedule — this is one job, and the
 * dependency would be the larger change. It does mean every replica sweeps;
 * the delete is idempotent, so that costs duplicate work rather than harm.
 */
@Injectable()
export class RefreshTokenCleanupService
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(RefreshTokenCleanupService.name);
	private timer?: NodeJS.Timeout;

	constructor(private readonly prisma: PrismaService) {}

	onModuleInit(): void {
		// unref so a pending sweep never holds the process open during shutdown.
		this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
		this.timer.unref();
	}

	onModuleDestroy(): void {
		clearInterval(this.timer);
	}

	async sweep(): Promise<number> {
		try {
			const { count } = await this.prisma.refreshToken.deleteMany({
				where: { expiresAt: { lt: new Date() } },
			});

			if (count > 0) {
				this.logger.log(`Pruned ${count} expired refresh tokens`);
			}

			return count;
		} catch (error) {
			// Housekeeping must never take the service down with it.
			this.logger.warn(
				`Refresh token sweep failed: ${
					error instanceof Error ? error.message : 'unknown'
				}`,
			);
			return 0;
		}
	}
}
