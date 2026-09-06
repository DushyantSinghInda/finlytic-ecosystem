import { request } from 'node:http';
import type {
	IncomingHttpHeaders,
	IncomingMessage,
	ServerResponse,
} from 'node:http';
import { json } from './http.ts';

/**
 * Hop-by-hop headers describe a single connection rather than the message, so
 * they are not forwarded (RFC 9110 section 7.6.1). Forwarding `transfer-encoding`
 * alongside a `content-length` lets this proxy and the upstream disagree about
 * where a request ends, which is the basis of request smuggling.
 */
const HOP_BY_HOP = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
]);

function forwardable(
	headers: IncomingHttpHeaders,
): Record<string, string | string[]> {
	const result: Record<string, string | string[]> = {};

	for (const [name, value] of Object.entries(headers)) {
		// Node lowercases incoming header names, so the set comparison is safe.
		if (value === undefined || HOP_BY_HOP.has(name) || name === 'host') {
			continue;
		}

		result[name] = value;
	}

	return result;
}

export function proxy(
	req: IncomingMessage,
	res: ServerResponse,
	target: string,
): void {
	const upstream = new URL(req.url ?? '/', target);
	const headers = forwardable(req.headers);

	// Written from the socket and never copied from the caller, otherwise a
	// client could dictate the address the upstream records.
	headers['x-forwarded-for'] = req.socket.remoteAddress ?? '';
	headers['x-forwarded-proto'] = 'http';
	headers['x-forwarded-host'] = req.headers.host ?? '';

	let timedOut = false;

	const upstreamReq = request(
		{
			protocol: upstream.protocol,
			hostname: upstream.hostname,
			port: upstream.port,
			path: upstream.pathname + upstream.search,
			method: req.method,
			headers,
		},
		(upstreamRes) => {
			// The upstream sends its own hop-by-hop headers, and framing on this
			// connection is Node's to manage.
			res.writeHead(
				upstreamRes.statusCode ?? 502,
				forwardable(upstreamRes.headers),
			);
			upstreamRes.pipe(res);
		},
	);

	upstreamReq.setTimeout(30_000, () => {
		timedOut = true;
		upstreamReq.destroy(new Error('Upstream timed out'));
	});

	upstreamReq.on('error', (error) => {
		console.error(`[gateway] ${target}${req.url ?? ''} -> ${error.message}`);

		if (res.headersSent) {
			// The status line has already gone out, so dropping the connection is
			// the only signal left.
			res.destroy();
			return;
		}

		if (timedOut) {
			json(res, 504, { statusCode: 504, message: 'Upstream timed out' });
			return;
		}

		json(res, 502, { statusCode: 502, message: 'Upstream unavailable' });
	});

	// Client hung up, so stop the upstream work it was waiting on.
	res.on('close', () => upstreamReq.destroy());

	// Streamed rather than buffered: request bodies are never parsed here, and
	// an upload should not sit in this process's memory.
	req.pipe(upstreamReq);
}
