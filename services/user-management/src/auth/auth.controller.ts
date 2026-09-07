import {
	Body,
	Controller,
	Headers,
	HttpCode,
	HttpStatus,
	Ip,
	Post,
	Req,
	Res,
	UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type { LoginResponse } from './auth.service.js';
import type { PublicUser } from '../users/user.mapper.js';
import {
	clearRefreshCookie,
	readRefreshCookie,
	setRefreshCookie,
} from './refresh-cookie.js';
import type { Request as ExpressRequest, Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly configService: ConfigService,
	) {}

	@Post('register')
	register(@Body() dto: RegisterDto): Promise<PublicUser> {
		return this.authService.register(dto);
	}

	@Post('login')
	@HttpCode(HttpStatus.OK)
	async login(
		@Body() dto: LoginDto,
		@Ip() ipAddress: string,
		@Res({ passthrough: true }) res: Response,
		@Headers('user-agent') userAgent?: string,
	): Promise<Omit<LoginResponse, 'refreshToken'>> {
		const { refreshToken, ...session } = await this.authService.login(dto, {
			ipAddress,
			userAgent,
		});

		// The service returns the whole session; the controller decides the
		// transport. The refresh token leaves as a cookie and never as JSON.
		setRefreshCookie(
			res,
			refreshToken,
			this.configService.get<number>('JWT_REFRESH_TOKEN_TTL_DAYS')!,
		);

		return session;
	}

	@Post('refresh')
	@HttpCode(HttpStatus.OK)
	async refresh(
		@Body() dto: RefreshDto,
		@Req() req: ExpressRequest,
		@Ip() ipAddress: string,
		@Res({ passthrough: true }) res: Response,
		@Headers('user-agent') userAgent?: string,
	): Promise<Omit<LoginResponse, 'refreshToken'>> {
		// Cookie first, body second — browsers use the cookie, API clients the body.
		const presented = readRefreshCookie(req) ?? dto.refreshToken;

		if (!presented) {
			throw new UnauthorizedException('Invalid refresh token');
		}

		const { refreshToken, ...session } = await this.authService.refresh(
			{ refreshToken: presented },
			{ ipAddress, userAgent },
		);

		setRefreshCookie(
			res,
			refreshToken,
			this.configService.get<number>('JWT_REFRESH_TOKEN_TTL_DAYS')!,
		);

		return session;
	}

	@Post('logout')
	@HttpCode(HttpStatus.NO_CONTENT)
	async logout(
		@Body() dto: RefreshDto,
		@Req() req: ExpressRequest,
		@Res({ passthrough: true }) res: Response,
	): Promise<void> {
		const presented = readRefreshCookie(req) ?? dto.refreshToken;

		clearRefreshCookie(res);

		if (presented) {
			await this.authService.logout({ refreshToken: presented });
		}
	}
}
