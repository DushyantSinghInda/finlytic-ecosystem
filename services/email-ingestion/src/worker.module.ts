import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { QueueModule } from './queue/queue.module.js';
import { SyncProcessingModule } from './sync/sync-processing.module.js';

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
