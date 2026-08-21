import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '../generated/prisma/client';
import { type PublicUser, toPublicUser } from './user.mapper';

@Injectable()
export class UsersService {
	constructor(private readonly prisma: PrismaService) {}

	findByEmail(email: string): Promise<User | null> {
		return this.prisma.user.findUnique({ where: { email } });
	}

	findById(id: string): Promise<User | null> {
		return this.prisma.user.findUnique({ where: { id } });
	}

	create(email: string, passwordHash: string): Promise<User> {
		return this.prisma.user.create({ data: { email, passwordHash } });
	}

	async getPublicProfile(id: string): Promise<PublicUser> {
		const user = await this.findById(id);

		if (!user || !user.isActive) {
			throw new UnauthorizedException();
		}

		return toPublicUser(user);
	}
}
