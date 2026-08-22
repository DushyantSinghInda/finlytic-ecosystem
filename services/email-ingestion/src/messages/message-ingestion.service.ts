import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { type MailAccount, Prisma } from '../generated/prisma/client';
import type { RawMessage } from '../mail/providers/mail-provider.interface';
import { type AddressObject, simpleParser } from 'mailparser';

export interface IngestResult {
	providerMessageId: string;
	created: boolean;
}

@Injectable()
export class MessageIngestionService {
	private readonly logger = new Logger(MessageIngestionService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly storage: ObjectStorageService,
	) {}

	async ingest(account: MailAccount, raw: RawMessage): Promise<IngestResult> {
		const alreadyStored = await this.prisma.message.findUnique({
			where: {
				accountId_providerMessageId: {
					accountId: account.id,
					providerMessageId: raw.providerMessageId,
				},
			},
			select: { id: true },
		});

		if (alreadyStored) {
			return { providerMessageId: raw.providerMessageId, created: false };
		}

		const parsed = await simpleParser(raw.raw);
		const sentAt = parsed.date ?? raw.internalDate;

		// Blob first, pointer second.
		const rawObjectKey = this.storage.buildRawKey(
			account.id,
			sentAt,
			raw.providerMessageId,
		);
		await this.storage.put(rawObjectKey, raw.raw, 'message/rfc822');

		let bodyTextKey: string | undefined;
		const bodyText = parsed.text?.trim();

		if (bodyText) {
			bodyTextKey = this.storage.buildBodyKey(
				account.id,
				sentAt,
				raw.providerMessageId,
			);
			await this.storage.put(
				bodyTextKey,
				Buffer.from(bodyText, 'utf8'),
				'text/plain; charset=utf-8',
			);
		}

		const from = parsed.from?.value?.[0];

		try {
			await this.prisma.message.create({
				data: {
					accountId: account.id,
					providerMessageId: raw.providerMessageId,
					providerThreadId: raw.providerThreadId,
					subject: parsed.subject ?? null,
					fromAddress: from?.address?.toLowerCase() ?? null,
					fromName: from?.name || null,
					toAddresses: this.addressList(parsed.to),
					sentAt,
					snippet: raw.snippet ?? null,
					labels: raw.labels,
					sizeBytes: raw.sizeBytes ?? raw.raw.length,
					hasAttachments: parsed.attachments.length > 0,
					rawObjectKey,
					bodyTextKey,
				},
			});
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2002'
			) {
				return { providerMessageId: raw.providerMessageId, created: false };
			}
			throw error;
		}

		return { providerMessageId: raw.providerMessageId, created: true };
	}

	private addressList(
		value: AddressObject | AddressObject[] | undefined,
	): string[] {
		if (!value) {
			return [];
		}

		return (Array.isArray(value) ? value : [value]).flatMap((group) =>
			group.value
				.map((address) => address.address?.toLowerCase())
				.filter((address): address is string => Boolean(address)),
		);
	}
}
