import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
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
	let decoded: string;

	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		// A malformed percent-sequence is not a path. Returning null is already
		// how this function says "outside the root" — an unhandled URIError here
		// takes the whole process down instead.
		return null;
	}

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
	let stats;

	try {
		stats = await stat(filePath);
	} catch {
		return false;
	}

	if (!stats.isFile()) {
		return false;
	}

	res.writeHead(200, {
		'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
		'content-length': stats.size,
		'cache-control': cacheControl,
	});

	try {
		// Not `.pipe()`: it forwards data but not errors, so a read failing
		// mid-transfer raises an unhandled 'error' and takes the only ingress
		// down. The try/catch this replaced could never have caught that — the
		// failure arrives long after the synchronous call returned.
		await pipeline(createReadStream(filePath), res);
	} catch {
		// The status line left with the first byte, so there is nothing left to
		// send. Dropping the socket tells the client the file is incomplete.
		res.destroy();
	}

	// Answered either way. Returning false here would send the caller on to the
	// SPA fallback, which would try to write headers onto a response already in
	// flight.
	return true;
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
