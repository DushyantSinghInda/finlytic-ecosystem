import { Module } from '@nestjs/common';
import { SyncQueueService } from './sync-queue.service';
import { BullModule } from '@nestjs/bullmq';
import { MAIL_SYNC_QUEUE } from './queue.constants';
import { ConfigService } from '@nestjs/config';

const bullRoot = BullModule.forRootAsync({
	inject: [ConfigService],
	useFactory: (config: ConfigService) => ({
		connection: {
			host: config.get<string>('REDIS_HOST'),
			port: config.get<number>('REDIS_PORT'),
		},
		defaultJobOptions: {
			attempts: 5,
			backoff: { type: 'exponential', delay: 5_000 },
			removeOnComplete: true,
			removeOnFail: { age: 86_400 },
		},
	}),
});

const syncQueue = BullModule.registerQueue({ name: MAIL_SYNC_QUEUE });

@Module({
	imports: [bullRoot, syncQueue],
	providers: [SyncQueueService],
	exports: [bullRoot, syncQueue, SyncQueueService],
})
export class QueueModule {}
