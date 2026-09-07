import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { serveStatic } from './static.ts';

describe('serveStatic', () => {
	let root = '';
	let server: Server;
	let base = '';

	before(async () => {
		root = resolve(await mkdtemp(join(tmpdir(), 'gw-static-')));
		await writeFile(
			join(root, 'index.html'),
			'<!doctype html><title>app</title>',
		);
		await mkdir(join(root, 'assets'));
		await writeFile(
			join(root, 'assets', 'app-abc123.js'),
			'export const x = 1;',
		);
		// The file the traversal test must not be able to reach.
		await writeFile(resolve(root, '..', 'gw-secret.txt'), 'do not serve me');

		server = createServer((req, res) => {
			void serveStatic(
				root,
				new URL(req.url ?? '/', 'http://x.invalid').pathname,
				req.headers.accept?.includes('text/html') ?? false,
				res,
			).then((handled) => {
				if (!handled) {
					res.writeHead(404).end('nope');
				}
			});
		});

		await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
		base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
	});

	after(async () => {
		server.closeAllConnections();
		await new Promise<void>((done) => server.close(() => done()));
		await rm(root, { recursive: true, force: true });
		await rm(resolve(root, '..', 'gw-secret.txt'), { force: true });
	});

	it('serves a hashed asset as immutable', async () => {
		const response = await fetch(`${base}/assets/app-abc123.js`);

		assert.equal(response.status, 200);
		assert.match(response.headers.get('cache-control') ?? '', /immutable/);
	});

	it('falls back to index.html for a client-side route', async () => {
		const response = await fetch(`${base}/accounts`, {
			headers: { accept: 'text/html' },
		});

		assert.equal(response.status, 200);
		assert.equal(response.headers.get('cache-control'), 'no-cache');
	});

	it('404s a missing asset instead of returning HTML', async () => {
		const response = await fetch(`${base}/assets/missing.js`, {
			headers: { accept: 'text/html' },
		});

		// Returning index.html here would surface as a MIME type error in the
		// browser, which points nowhere near the actual cause.
		assert.equal(response.status, 404);
	});

	it('refuses to escape the root', async () => {
		const response = await fetch(`${base}/../gw-secret.txt`, {
			headers: { accept: 'text/plain' },
		});

		assert.notEqual(response.status, 200);
	});
});
