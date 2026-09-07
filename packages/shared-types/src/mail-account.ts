export type MailProvider = 'GMAIL' | 'ZOHO';
export type AccountStatus = 'ACTIVE' | 'REAUTH_REQUIRED' | 'DISABLED';

/** One row of GET /accounts. */
export interface MailAccountSummary {
	id: string;
	provider: MailProvider;
	emailAddress: string;
	status: AccountStatus;
	scopes: string[];
	/** ISO 8601, or null if it has never synced. */
	lastSyncedAt: string | null;
	createdAt: string;
}

/** What POST /accounts/:id/sync answers — 202, the work has not happened yet. */
export interface SyncRequestResult {
	accepted: boolean;
	jobId: string;
	alreadyQueued: boolean;
	status: AccountStatus;
}
