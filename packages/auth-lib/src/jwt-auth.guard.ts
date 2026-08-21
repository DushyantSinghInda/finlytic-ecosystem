import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AccessTokenPayload } from './types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(private readonly jwtService: JwtService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<Request>();
		const token = this.extractBearerToken(request);

		if (!token) {
			throw new UnauthorizedException('Missing access token');
		}

		try {
			const payload =
				await this.jwtService.verifyAsync<AccessTokenPayload>(token);
			request.user = { id: payload.sub, role: payload.role };
			return true;
		} catch {
			throw new UnauthorizedException('Invalid or expired access token');
		}
	}

	private extractBearerToken(request: Request): string | undefined {
		const [scheme, value] = request.headers.authorization?.split(' ') ?? [];
		return scheme.toLowerCase() === 'bearer' ? value : undefined;
	}
}
