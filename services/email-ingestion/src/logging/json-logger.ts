import type { LoggerService } from '@nestjs/common';
import { currentRequestId } from './request-context.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

export class JsonLogger implements LoggerService {
	private readonly service: string;

	constructor(service: string) {
		this.service = service;
	}

	log(message: unknown, ...params: unknown[]): void {
		this.write('info', message, params);
	}

	warn(message: unknown, ...params: unknown[]): void {
		this.write('warn', message, params);
	}

	error(message: unknown, ...params: unknown[]): void {
		this.write('error', message, params);
	}

	debug(message: unknown, ...params: unknown[]): void {
		this.write('debug', message, params);
	}

	verbose(message: unknown, ...params: unknown[]): void {
		this.write('debug', message, params);
	}

	private write(level: Level, message: unknown, params: unknown[]): void {
		// Nest passes the context — usually the class name — as the last
		// argument, and for error() it passes the stack as the first.
		const last = params.at(-1);
		const context = typeof last === 'string' ? last : undefined;
		const stack =
			level === 'error' && params.length > 1 && typeof params[0] === 'string'
				? params[0]
				: undefined;

		const serialised =
			message instanceof Error
				? // message and stack are non-enumerable, so JSON.stringify(error)
					// is "{}" — the one shape that must never be silently dropped.
					`${message.name}: ${message.message}`
				: typeof message === 'string'
					? message
					: JSON.stringify(message);

		process.stdout.write(
			`${JSON.stringify({
				ts: new Date().toISOString(),
				level,
				service: this.service,
				requestId: currentRequestId() ?? null,
				context: context ?? null,
				msg: serialised,
				stack: stack ?? (message instanceof Error ? message.stack : undefined),
			})}\n`,
		);
	}
}
