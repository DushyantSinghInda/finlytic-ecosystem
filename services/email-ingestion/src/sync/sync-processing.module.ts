import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { MailModule } from '../mail/mail.module';
import { MessagesModule } from '../messages/messages.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MailSyncProcessor } from './mail-sync.processor';
import { MailSyncService } from './mail-sync.service';
import { SyncSchedulerService } from './sync-scheduler.service';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueModule } from '../queue/queue.module';

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
