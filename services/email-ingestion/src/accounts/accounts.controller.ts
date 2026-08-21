import { Controller, Get, UseGuards } from '@nestjs/common';
import {
	CurrentUser,
	JwtAuthGuard,
	type AuthenticatedUser,
} from '@finlytic/auth-lib';
import { AccountsService } from './accounts.service';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
	constructor(private readonly accountsService: AccountsService) {}

	@Get()
	list(@CurrentUser() user: AuthenticatedUser) {
		return this.accountsService.listForUser(user.id);
	}
}
