import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { ServerResponse } from 'node:http';

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.map': 'application/json; charset=utf-8',
};

/**
 * Resolves a URL path inside the root, or null if it escapes.
 *
 * Joining a user-supplied path onto a directory is how static servers end up
 * serving /etc/passwd — or, here, the JWT public key. Normalising first and
 * then proving the result is still under the root is the whole defence.
 */
function resolveWithin(root: string, pathname: string): string | null {
	const decoded = decodeURIComponent(pathname);
	const candidate = resolve(join(root, normalize(decoded)));

	return candidate === root || candidate.startsWith(root + sep)
		? candidate
		: null;
}

async function sendFile(
	res: ServerResponse,
	filePath: string,
	cacheControl: string,
): Promise<boolean> {
	try {
		const stats = await stat(filePath);

		if (!stats.isFile()) {
			return false;
		}

		res.writeHead(200, {
			'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
			'content-length': stats.size,
			'cache-control': cacheControl,
		});

		createReadStream(filePath).pipe(res);

		return true;
	} catch {
		return false;
	}
}

/**
 * Returns true when it has answered. Vite emits content-hashed filenames under
 * /assets, so those can be cached forever; index.html must never be, or a
 * deploy leaves browsers pinned to the old asset names.
 */
export async function serveStatic(
	root: string,
	pathname: string,
	acceptsHtml: boolean,
	res: ServerResponse,
): Promise<boolean> {
	const filePath = resolveWithin(root, pathname);

	if (!filePath) {
		return false;
	}

	if (pathname !== '/') {
		const cacheControl = pathname.startsWith('/assets/')
			? 'public, max-age=31536000, immutable'
			: 'no-cache';

		if (await sendFile(res, filePath, cacheControl)) {
			return true;
		}
	}

	// SPA fallback — but only for navigations. A missing /assets/x.js must 404,
	// not return HTML, or the browser reports a baffling MIME type error.
	if (!acceptsHtml || extname(pathname) !== '') {
		return false;
	}

	return sendFile(res, join(root, 'index.html'), 'no-cache');
}
