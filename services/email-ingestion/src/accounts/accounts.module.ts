import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoModule } from '../crypto/crypto.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
	imports: [SecurityModule, PrismaModule, CryptoModule],
	controllers: [AccountsController],
	providers: [AccountsService],
	exports: [AccountsService],
})
export class AccountsModule {}
