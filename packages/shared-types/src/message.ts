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

export interface MessageDetail extends MessageSummary {
	providerThreadId: string | null;
	toAddresses: string[];
	/** Null when the message had no text part, or the object is gone. */
	bodyText: string | null;
	/** True when bodyText was cut at the size cap. */
	bodyTruncated: boolean;
}

export interface MessagePage {
	messages: MessageSummary[];
	/** Pass back as ?cursor= for the next page. null means the end. */
	nextCursor: string | null;
}
