import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';
import { Logger } from '@nestjs/common';
import { JsonLogger } from './logging/json-logger.js';

async function bootstrap() {
	const app = await NestFactory.createApplicationContext(WorkerModule, {
		bufferLogs: true,
	});

	app.useLogger(new JsonLogger('email-ingestion-worker'));

	app.enableShutdownHooks();

	new Logger('Worker').log('email-ingestion worker started — waiting for jobs');
}
void bootstrap();
