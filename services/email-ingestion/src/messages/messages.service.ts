import { Injectable, NotFoundException } from '@nestjs/common';
import type { MessagePage } from '@finlytic/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class MessagesService {
	constructor(private readonly prisma: PrismaService) { }

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
}