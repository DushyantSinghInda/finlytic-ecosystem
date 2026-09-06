import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { MailModule } from '../mail/mail.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MailSyncProcessor } from './mail-sync.processor.js';
import { MailSyncService } from './mail-sync.service.js';
import { SyncSchedulerService } from './sync-scheduler.service.js';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueModule } from '../queue/queue.module.js';

@Module({
	imports: [
		ScheduleModule.forRoot(),
		PrismaModule,
		MailModule,
		MessagesModule,
		AccountsModule,
		QueueModule,
	],
	providers: [MailSyncService, MailSyncProcessor, SyncSchedulerService],
})
export class SyncProcessingModule {}
