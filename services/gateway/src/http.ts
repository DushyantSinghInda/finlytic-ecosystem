import type { ServerResponse } from 'node:http';

export function json(
	res: ServerResponse,
	status: number,
	body: unknown,
	headers: Record<string, string> = {},
): void {
	const payload = JSON.stringify(body);

	res.writeHead(status, {
		...headers,
		'content-type': 'application/json; charset=utf-8',
		'content-length': Buffer.byteLength(payload),
	});
	res.end(payload);
}
