import { type AuthenticatedUser, CurrentUser, JwtAuthGuard } from '@finlytic/auth-lib';
import { Controller, Get, UseGuards } from '@nestjs/common';


@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
    @Get()
    list(@CurrentUser() user: AuthenticatedUser) {
        return {
            userId: user.id,
            role: user.role,
            accounts: [],
            note: 'Identity resolved from the JWT alone — no call to user-management.'
        }
    }
}