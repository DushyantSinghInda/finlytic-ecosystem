import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { MessageIngestionService } from './message-ingestion.service.js';
import { SecurityModule } from '../security/security.module.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

@Module({
	imports: [SecurityModule, PrismaModule, StorageModule],
	controllers: [MessagesController],
	providers: [MessageIngestionService, MessagesService],
	exports: [MessageIngestionService],
})
export class MessagesModule { }
