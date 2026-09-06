import {
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	UseGuards,
} from '@nestjs/common';
import {
	CurrentUser,
	JwtAuthGuard,
	type AuthenticatedUser,
} from '@finlytic/auth-lib';
import { AccountsService } from './accounts.service.js';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
	constructor(private readonly accountsService: AccountsService) {}

	@Get()
	list(@CurrentUser() user: AuthenticatedUser) {
		return this.accountsService.listForUser(user.id);
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
