import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';
import { Logger } from '@nestjs/common';

async function bootstrap() {
	const app = await NestFactory.createApplicationContext(WorkerModule);

	app.enableShutdownHooks();

	new Logger('Worker').log('email-ingestion worker started — waiting for jobs');
}
void bootstrap();
