import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { MessageIngestionService } from './message-ingestion.service';

@Module({
	imports: [PrismaModule, StorageModule],
	providers: [MessageIngestionService],
	exports: [MessageIngestionService],
})
export class MessagesModule {}
