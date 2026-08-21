import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
	constructor(private readonly prisma: PrismaService) {}

	async checkHealth(): Promise<{
		status: string;
		database: string;
		users: number;
	}> {
		await this.prisma.$queryRaw`SELECT 1`;
		const users = await this.prisma.user.count();

		return { status: 'ok', database: 'up', users };
	}
}
