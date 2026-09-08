import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '@finlytic/auth-lib';
import type { MessagePage } from '@finlytic/shared-types';
import { MessagesService } from './messages.service.js';

@Controller('accounts/:accountId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
	constructor(private readonly messages: MessagesService) { }

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
}