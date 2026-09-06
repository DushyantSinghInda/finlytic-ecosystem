import { request } from 'node:http';
import type {
	IncomingHttpHeaders,
	IncomingMessage,
	ServerResponse,
} from 'node:http';
import { json } from './http.ts';

/**
 * Hop-by-hop headers describe THIS connection, not the message, so a proxy must
 * never pass them on (RFC 9110 §7.6.1). `transfer-encoding` is the dangerous one:
 * forwarding it alongside a content-length is the classic request-smuggling
 * setup, where the proxy and the upstream disagree about where a request ends.
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

	// Set by US, from the socket — never copied from the caller. A client that
	// could set these would be telling the upstream where it came from.
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
			// Filter the response too — upstream sends its own hop-by-hop headers,
			// and Node manages framing on this connection itself.
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
			// The status line is already gone; the only honest signal left is
			// dropping the connection.
			res.destroy();
			return;
		}

		if (timedOut) {
			json(res, 504, { statusCode: 504, message: 'Upstream timed out' });
			return;
		}

		json(res, 502, { statusCode: 502, message: 'Upstream unavailable' });
	});

	// The client hung up — stop doing work on its behalf.
	res.on('close', () => upstreamReq.destroy());

	// Streamed, never buffered. The gateway does not need to know what a
	// request body is, and an upload should not sit in its memory.
	req.pipe(upstreamReq);
}
