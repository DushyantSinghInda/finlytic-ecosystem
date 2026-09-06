import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { JsonLogger } from './logging/json-logger.js';
import { runWithRequestId } from './logging/request-context.js';

async function bootstrap() {
	const app = await NestFactory.create(AppModule, { bufferLogs: true });

	app.useLogger(new JsonLogger('email-ingestion'));

	// Express level rather than a Nest middleware: it also covers 404s, runs
	// before guards, and avoids Nest 11's path-to-regexp wildcard syntax.
	app.use((req: Request, res: Response, next: NextFunction) => {
		const header = req.headers['x-request-id'];
		// Trusted here, unlike at the gateway — only the gateway can reach this
		// service. Constrained anyway, so a hostile value cannot bloat every line.
		const requestId =
			typeof header === 'string' && /^[\w-]{1,64}$/.test(header)
				? header
				: randomBytes(8).toString('hex');

		res.setHeader('x-request-id', requestId);
		runWithRequestId(requestId, next);
	});

	const configService = app.get(ConfigService);
	const port = configService.get<number>('PORT')!;

	app.enableShutdownHooks();
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
		}),
	);

	await app.listen(port);
	new Logger('Bootstrap').log(
		`email-ingestion listening on http://localhost:${port}`,
	);
}

void bootstrap();
