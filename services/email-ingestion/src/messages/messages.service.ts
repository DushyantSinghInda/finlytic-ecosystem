import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { MessagePage, MessageDetail } from '@finlytic/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';

// A body is text; anything past this is a mail loop, a log dump or an attack.
const MAX_BODY_BYTES = 256 * 1024;

@Injectable()
export class MessagesService {
	private readonly logger = new Logger(MessagesService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly storage: ObjectStorageService,
	) {}

	async listForAccount(
		userId: string,
		accountId: string,
		cursor: string | undefined,
		limit: number,
	): Promise<MessagePage> {
		// The account must belong to the caller. Deriving ownership from the
		// path instead of checking it is how one user reads another's mail.
		const account = await this.prisma.mailAccount.findFirst({
			where: { id: accountId, userId },
			select: { id: true },
		});

		if (!account) {
			throw new NotFoundException('Account not found');
		}

		const rows = await this.prisma.message.findMany({
			where: { accountId },
			// id breaks ties: two messages can share a timestamp, and without a
			// deterministic order a cursor can skip or repeat rows.
			orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
			// One extra row is how we know another page exists without a count().
			take: limit + 1,
			...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
			select: {
				id: true,
				subject: true,
				fromAddress: true,
				fromName: true,
				sentAt: true,
				snippet: true,
				hasAttachments: true,
				labels: true,
				sizeBytes: true,
			},
		});

		const page = rows.slice(0, limit);

		return {
			messages: page.map((message) => ({
				...message,
				sentAt: message.sentAt.toISOString(),
			})),
			nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
		};
	}

	async getForAccount(
		userId: string,
		accountId: string,
		messageId: string,
	): Promise<MessageDetail> {
		// Ownership travels through the relation, so it is one query and there
		// is no window where the account check and the read disagree.
		const message = await this.prisma.message.findFirst({
			where: { id: messageId, accountId, account: { userId } },
			select: {
				id: true,
				subject: true,
				fromAddress: true,
				fromName: true,
				sentAt: true,
				snippet: true,
				hasAttachments: true,
				labels: true,
				sizeBytes: true,
				providerThreadId: true,
				toAddresses: true,
				bodyTextKey: true,
			},
		});

		if (!message) {
			throw new NotFoundException('Message not found');
		}

		const { bodyTextKey, ...rest } = message;
		let bodyText: string | null = null;
		let bodyTruncated = false;

		if (bodyTextKey) {
			try {
				const buffer = await this.storage.get(bodyTextKey);

				bodyTruncated = buffer.byteLength > MAX_BODY_BYTES;
				// Cutting on a byte boundary can split a multi-byte character;
				// the cost is one replacement glyph at the very end.
				bodyText = buffer.subarray(0, MAX_BODY_BYTES).toString('utf8');
			} catch (error) {
				// Metadata is in Postgres and the blob is in object storage, so
				// the two can drift. A missing object is not a broken request —
				// the message still exists, it just has no readable body.
				this.logger.warn(
					`Body object ${bodyTextKey} unreadable: ${
						error instanceof Error ? error.message : 'unknown'
					}`,
				);
			}
		}

		return {
			...rest,
			sentAt: rest.sentAt.toISOString(),
			bodyText,
			bodyTruncated,
		};
	}
}
