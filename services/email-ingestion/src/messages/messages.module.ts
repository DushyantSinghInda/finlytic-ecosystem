import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { MessageIngestionService } from './message-ingestion.service.js';

@Module({
	imports: [PrismaModule, StorageModule],
	providers: [MessageIngestionService],
	exports: [MessageIngestionService],
})
export class MessagesModule {}
