export const MAIL_SYNC_QUEUE = 'mail-sync';
export const SYNC_ACCOUNT_JOB = 'sync-account';

export interface MailSyncJobData {
	accountId: string;
	reason: 'manual' | 'scheduled';
	/** The request that queued it. Absent for scheduled runs. */
	requestId?: string;
}
