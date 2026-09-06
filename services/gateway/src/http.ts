import type { ServerResponse } from 'node:http';

export function json(res: ServerResponse, status: number, body: unknown): void {
	const payload = JSON.stringify(body);

	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'content-length': Buffer.byteLength(payload),
	});
	res.end(payload);
}
