import {
	Body,
	Controller,
	Headers,
	HttpCode,
	HttpStatus,
	Ip,
	Post,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import type { LoginResponse } from './auth.service';
import type { PublicUser } from '../users/user.mapper';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('register')
	@Throttle({ default: { limit: 5, ttl: 60_000 } })
	register(@Body() dto: RegisterDto): Promise<PublicUser> {
		return this.authService.register(dto);
	}

	@Post('login')
	@Throttle({ default: { limit: 5, ttl: 60_000 } })
	@HttpCode(HttpStatus.OK)
	login(
		@Body() dto: LoginDto,
		@Ip() ipAddress: string,
		@Headers('user-agent') userAgent?: string,
	): Promise<LoginResponse> {
		return this.authService.login(dto, { ipAddress, userAgent });
	}

	@Post('refresh')
	@Throttle({ default: { limit: 20, ttl: 60_000 } })
	@HttpCode(HttpStatus.OK)
	refresh(
		@Body() dto: RefreshDto,
		@Ip() ipAddress: string,
		@Headers('user-agent') userAgent?: string,
	): Promise<LoginResponse> {
		return this.authService.refresh(dto, { ipAddress, userAgent });
	}

	@Post('logout')
	@HttpCode(HttpStatus.NO_CONTENT)
	logout(@Body() dto: RefreshDto): Promise<void> {
		return this.authService.logout(dto);
	}
}
