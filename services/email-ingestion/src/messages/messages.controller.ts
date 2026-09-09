import {
	Controller,
	Get,
	Logger,
	NotFoundException,
	Param,
	ParseUUIDPipe,
	Query,
	Res,
	ServiceUnavailableException,
	UseGuards,
} from '@nestjs/common';
import {
	CurrentUser,
	JwtAuthGuard,
	type AuthenticatedUser,
} from '@finlytic/auth-lib';
import type { MessageDetail, MessagePage } from '@finlytic/shared-types';
import { MessagesService } from './messages.service.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';
import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';

@Controller('accounts/:accountId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
	private readonly logger = new Logger(MessagesController.name)
	constructor(
		private readonly messages: MessagesService,
		private readonly storage: ObjectStorageService,
	) { }

	@Get()
	list(
		@CurrentUser() user: AuthenticatedUser,
		@Param('accountId', ParseUUIDPipe) accountId: string,
		@Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
		@Query('limit') limit?: string,
	): Promise<MessagePage> {
		// Clamped: an unbounded limit is a free denial of service and a slow query.
		const take = Math.min(Math.max(Number(limit) || 25, 1), 100);

		return this.messages.listForAccount(user.id, accountId, cursor, take);
	}

	@Get(':messageId')
	get(
		@CurrentUser() user: AuthenticatedUser,
		@Param('accountId', ParseUUIDPipe) accountId: string,
		@Param('messageId', ParseUUIDPipe) messageId: string,
	): Promise<MessageDetail> {
		return this.messages.getForAccount(user.id, accountId, messageId);
	}

	@Get(':messageId/raw')
	async raw(
		@CurrentUser() user: AuthenticatedUser,
		@Param('accountId', ParseUUIDPipe) accountId: string,
		@Param('messageId', ParseUUIDPipe) messageId: string,
		@Res() res: Response,
	): Promise<void> {
		const key = await this.messages.rawObjectKeyFor(
			user.id,
			accountId,
			messageId,
		);

		let object: Awaited<ReturnType<ObjectStorageService['getStream']>>;

		try {
			object = await this.storage.getStream(key);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'unknown';
			this.logger.warn(`Raw object ${key} unreadable: ${reason}`);

			// An object that drifted away is gone for good; a dead MinIO is worth
			// retrying. One catch, two very different things to tell the caller —
			// and 404 for both would send the next debugger to the wrong system.
			if (error instanceof Error && error.name === 'NoSuchKey') {
				throw new NotFoundException('Original message is no longer stored');
			}

			throw new ServiceUnavailableException('Message storage is unavailable');
		}

		res.writeHead(200, {
			'content-type': 'message/rfc822',
			// The id, never the subject: a subject is attacker-controlled text
			// going into a header, and this one names a file on disk.
			'content-disposition': `attachment; filename="message-${messageId}.eml"`,
			...(object.contentLength
				? { 'content-length': object.contentLength }
				: {}),
		});

		try {
			// Not `.pipe()`: that forwards data but not errors, so a mid-transfer
			// failure raises an unhandled 'error' event and takes the process down.
			await pipeline(object.body, res);
		} catch (error) {
			// The status line left with the first byte, so there is no code left to
			// change. Dropping the socket is the only way to tell the client that
			// the file it just saved is incomplete.
			this.logger.warn(
				`Raw download ${key} failed mid-stream: ${error instanceof Error ? error.message : 'unknown'
				}`,
			);
			res.destroy();
		}
	}
}
