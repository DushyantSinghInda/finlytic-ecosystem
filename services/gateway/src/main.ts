import { loadConfig } from './config.ts';
import { log } from './logger.ts';
import { createGatewayServer } from './server.ts';

const config = loadConfig();
const server = createGatewayServer(config);

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
