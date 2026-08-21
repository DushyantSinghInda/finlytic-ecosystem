import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '../generated/prisma/client';

@Injectable()
export class TokenService {
	constructor(private readonly jwtService: JwtService) {}

	issueAccessToken(user: User): Promise<string> {
		return this.jwtService.signAsync({ role: user.role }, { subject: user.id });
	}
}
