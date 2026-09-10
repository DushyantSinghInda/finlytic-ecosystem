import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';
import { Logger } from '@nestjs/common';
import { JsonLogger } from './logging/json-logger.js';
import { installCrashHandlers } from './logging/crash-handlers.js';

// Installed before bootstrap, not inside it: startup is the likeliest time to
// crash, and a rejection from bootstrap() itself would otherwise reach a
// process with no handler and exit with a raw stack and no structured line.
const logger = new JsonLogger('email-ingestion-worker');
installCrashHandlers(logger);

async function bootstrap() {
	const app = await NestFactory.createApplicationContext(WorkerModule, {
		bufferLogs: true,
	});

	app.useLogger(logger);

	app.enableShutdownHooks();

	new Logger('Worker').log('email-ingestion worker started — waiting for jobs');
}
void bootstrap();
