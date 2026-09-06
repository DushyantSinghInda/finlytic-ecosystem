import { loadConfig } from './config.ts';
import { createGatewayServer } from './server.ts';

const config = loadConfig();
const server = createGatewayServer(config);

server.listen(config.port, () => {
	console.log(`[gateway] listening on http://127.0.0.1:${config.port}`);
});

// Without these handlers `docker stop` waits the full 10s timeout before
// killing the process, which looks like a hang rather than a shutdown.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		console.log(`[gateway] ${signal} received, closing`);
		server.close(() => process.exit(0));
	});
}
