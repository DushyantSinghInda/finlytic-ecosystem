import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { QueueModule } from './queue/queue.module';
import { SyncProcessingModule } from './sync/sync-processing.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: '.env',
			validate: validateEnv,
		}),
		QueueModule,
		SyncProcessingModule,
	],
})
export class WorkerModule {}
