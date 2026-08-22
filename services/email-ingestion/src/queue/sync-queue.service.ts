import { Injectable, Logger } from '@nestjs/common';
import {
	MAIL_SYNC_QUEUE,
	type MailSyncJobData,
	SYNC_ACCOUNT_JOB,
} from './queue.constants';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class SyncQueueService {
	private readonly logger = new Logger(SyncQueueService.name);

	constructor(
		@InjectQueue(MAIL_SYNC_QUEUE)
		private readonly queue: Queue<MailSyncJobData>,
	) {}

	async enqueueAccountSync(
		accountId: string,
		reason: MailSyncJobData['reason'],
	): Promise<{ jobId: string; alreadyQueued: boolean }> {
		const jobId = `sync-${accountId}`;
		const existing = await this.queue.getJob(jobId);

		if (existing) {
			const state = await existing.getState();
			const pending = [
				'waiting',
				'waiting-children',
				'active',
				'delayed',
				'prioritized',
			];

			if (pending.includes(state)) {
				return { jobId, alreadyQueued: true };
			}

			// Terminal state (completed / failed) — the id is stale, clear it.
			await existing.remove();
			this.logger.log(`Cleared ${state} job ${jobId} before re-queueing`);
		}

		await this.queue.add(SYNC_ACCOUNT_JOB, { accountId, reason }, { jobId });
		this.logger.log(`Queued sync for account ${accountId} (${reason})`);

		return { jobId, alreadyQueued: false };
	}
}
