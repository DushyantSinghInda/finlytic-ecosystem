import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
	MAIL_SYNC_QUEUE,
	type MailSyncJobData,
} from '../queue/queue.constants.js';
import { MailSyncService, type SyncOutcome } from './mail-sync.service.js';
import { Job } from 'bullmq';

@Processor(MAIL_SYNC_QUEUE, { concurrency: 2 })
export class MailSyncProcessor extends WorkerHost {
	private readonly logger = new Logger(MailSyncProcessor.name);

	constructor(private readonly mailSync: MailSyncService) {
		super();
	}

	async process(job: Job<MailSyncJobData>): Promise<SyncOutcome> {
		this.logger.log(
			`Processing ${job.name} ${job.id} (attempt ${job.attemptsMade + 1})`,
		);

		return this.mailSync.syncAccount(job.data.accountId);
	}
}
