import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { EncryptionService } from './crypto/encryption.service';
import { ObjectStorageService } from './storage/object-storage.service';

@Injectable()
export class AppService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService,
		private readonly storage: ObjectStorageService,
	) {}

	async checkHealth() {
		await this.prisma.$queryRaw`SELECT 1`;
		const accounts = await this.prisma.mailAccount.count();
		const messages = await this.prisma.message.count();

		const probe = 'encryption-self-test';
		const roundTripped = this.encryption.decrypt(
			this.encryption.encrypt(probe),
		);

		return {
			status: 'ok',
			database: 'up',
			encryption: roundTripped === probe ? 'ok' : 'FAILED',
			storage: (await this.storage.isReachable()) ? 'up' : 'DOWN',
			accounts,
			messages,
		};
	}
}
