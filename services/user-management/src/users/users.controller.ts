import { Controller, Get, UseGuards } from '@nestjs/common';
import {
	CurrentUser,
	JwtAuthGuard,
	type AuthenticatedUser,
} from '@finlytic/auth-lib';
import { UsersService } from './users.service';
import type { PublicUser } from './user.mapper';

@Controller('users')
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Get('me')
	@UseGuards(JwtAuthGuard)
	me(@CurrentUser() current: AuthenticatedUser): Promise<PublicUser> {
		return this.usersService.getPublicProfile(current.id);
	}
}
