import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
	MAIL_SYNC_QUEUE,
	type MailSyncJobData,
} from '../queue/queue.constants.js';
import { MailSyncService, type SyncOutcome } from './mail-sync.service.js';
import { Job } from 'bullmq';
import { randomBytes } from 'node:crypto';
import { runWithRequestId } from '../logging/request-context.js';

@Processor(MAIL_SYNC_QUEUE, { concurrency: 2 })
export class MailSyncProcessor extends WorkerHost {
	private readonly logger = new Logger(MailSyncProcessor.name);

	constructor(private readonly mailSync: MailSyncService) {
		super();
	}

	async process(job: Job<MailSyncJobData>): Promise<SyncOutcome> {
		// A manual sync carries the id of the request that queued it, so the API
		// call and the work it caused share one id. A scheduled run has no
		// request behind it, so it gets its own id to tie its own lines together.
		const requestId = job.data.requestId ?? randomBytes(8).toString('hex');

		return runWithRequestId(requestId, () => {
			this.logger.log(
				`Processing ${job.name} ${job.id} (attempt ${job.attemptsMade + 1})`,
			);

			return this.mailSync.syncAccount(job.data.accountId);
		});
	}
}
