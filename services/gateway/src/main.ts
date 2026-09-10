import { loadConfig } from './config.ts';
import { log } from './logger.ts';
import { createGatewayServer } from './server.ts';

const config = loadConfig();
const server = createGatewayServer(config);

// Last-resort handlers. Without them an async throw in the request handler —
// exactly what a malformed percent-sequence in a URL used to cause — kills the
// only ingress with a raw stack on stderr and nothing in the structured log.
for (const kind of ['uncaughtException', 'unhandledRejection'] as const) {
	process.on(kind, (reason: unknown) => {
		const error = reason instanceof Error ? reason : new Error(String(reason));

		log('error', 'fatal', { kind, error: error.message, stack: error.stack });

		// Non-zero on purpose: `restart: unless-stopped` restarts a clean exit too,
		// so exiting 0 would read as `Restarting (0)` rather than a crash.
		process.exitCode = 1;
		// stdout is a pipe under Docker; give the line a moment to flush.
		setTimeout(() => process.exit(1), 50);
	});
}

server.listen(config.port, () => {
	log('info', 'listening', { port: config.port });
});

// Without these handlers `docker stop` waits the full 10s timeout before
// killing the process, which looks like a hang rather than a shutdown.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		log('info', 'shutting down', { signal });
		server.close(() => process.exit(0));
	});
}
