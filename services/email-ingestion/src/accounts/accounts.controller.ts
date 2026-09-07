import {
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Req,
	Res,
	UseGuards,
} from '@nestjs/common';
import {
	CurrentUser,
	JwtAuthGuard,
	type AuthenticatedUser,
} from '@finlytic/auth-lib';
import { AccountsService } from './accounts.service.js';
import type { Request as ExpressRequest, Response } from 'express';
import { SyncEventsService } from '../queue/sync-events.service.js';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
	constructor(
		private readonly accountsService: AccountsService,
		private readonly syncEvents: SyncEventsService,
	) {}

	@Get()
	list(@CurrentUser() user: AuthenticatedUser) {
		return this.accountsService.listForUser(user.id);
	}

	@Get('events')
	async events(
		@CurrentUser() user: AuthenticatedUser,
		@Req() req: ExpressRequest,
		@Res() res: Response,
	): Promise<void> {
		// Ownership is decided once, at connect time: the queue event stream is
		// global, and a client must only ever see its own accounts.
		const owned = new Set(
			(await this.accountsService.listForUser(user.id)).map(
				(account) => account.id,
			),
		);

		res.writeHead(200, {
			'content-type': 'text/event-stream',
			// no-transform stops any proxy deciding to buffer this into oblivion.
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
		});
		res.write(': connected\n\n');

		const unsubscribe = this.syncEvents.subscribe((event) => {
			if (!owned.has(event.accountId)) {
				return;
			}

			res.write(`event: sync\ndata: ${JSON.stringify(event)}\n\n`);
		});

		// The gateway drops an upstream connection after 30s of inactivity, so a
		// two-byte comment every 15s is what keeps a quiet stream open.
		const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

		req.on('close', () => {
			clearInterval(heartbeat);
			unsubscribe();
			res.end();
		});
	}

	@Post(':id/preview')
	preview(
		@CurrentUser() user: AuthenticatedUser,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		return this.accountsService.preview(user.id, id);
	}

	@Post(':id/sync')
	@HttpCode(HttpStatus.ACCEPTED)
	requestSync(
		@CurrentUser() user: AuthenticatedUser,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		return this.accountsService.requestSync(user.id, id);
	}
}
