export interface MessageSummary {
	id: string;
	subject: string | null;
	fromAddress: string | null;
	fromName: string | null;
	/** ISO 8601 — the Date header if the message had one. */
	sentAt: string;
	snippet: string | null;
	hasAttachments: boolean;
	labels: string[];
	sizeBytes: number | null;
}

export interface MessagePage {
	messages: MessageSummary[];
	/** Pass back as ?cursor= for the next page. null means the end. */
	nextCursor: string | null;
}