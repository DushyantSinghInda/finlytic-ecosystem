import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
