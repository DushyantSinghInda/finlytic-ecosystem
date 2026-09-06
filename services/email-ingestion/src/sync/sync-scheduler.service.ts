import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { SyncQueueService } from '../queue/sync-queue.service.js';
import { AccountStatus } from '../generated/prisma/client.js';

@Injectable()
export class SyncSchedulerService {
	private readonly logger = new Logger(SyncSchedulerService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly syncQueue: SyncQueueService,
	) {}

	@Cron(CronExpression.EVERY_5_MINUTES)
	async pollActiveAccounts(): Promise<void> {
		const accounts = await this.prisma.mailAccount.findMany({
			where: { status: AccountStatus.ACTIVE },
			select: { id: true },
		});

		if (accounts.length === 0) {
			return;
		}

		let queued = 0;

		for (const account of accounts) {
			const result = await this.syncQueue.enqueueAccountSync(
				account.id,
				'scheduled',
			);

			if (!result.alreadyQueued) {
				queued++;
			}
		}

		this.logger.log(
			`Poll: ${queued} queued, ${accounts.length - queued} already pending`,
		);
	}
}
