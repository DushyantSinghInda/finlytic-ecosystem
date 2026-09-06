import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { JsonLogger } from './logging/json-logger.js';
import { runWithRequestId } from './logging/request-context.js';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		// Nest logs while starting, before useLogger is called. Buffering means
		// those lines come out as JSON too rather than as text.
		bufferLogs: true,
	});

	app.useLogger(new JsonLogger('user-management'));

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

	// The gateway is the only thing that can reach this service, and it
	// overwrites x-forwarded-for with the address it saw on the socket.
	// Trusting exactly one hop makes @Ip() the client again rather than the
	// gateway's container address.
	app.set('trust proxy', 1);

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
		`user-management listening on http://localhost:${port}`,
	);
}
void bootstrap();
