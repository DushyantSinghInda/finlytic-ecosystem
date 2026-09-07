import type { Request, Response } from 'express';

export const REFRESH_COOKIE = 'refresh_token';

/**
 * Scoped to /auth so the browser never attaches it to /users or /accounts —
 * the cookie is only useful at the two endpoints that spend it.
 */
const COOKIE_PATH = '/auth';

export function setRefreshCookie(
	res: Response,
	token: string,
	ttlDays: number,
): void {
	res.cookie(REFRESH_COOKIE, token, {
		httpOnly: true,
		sameSite: 'strict',
		// Chrome treats http://localhost as a secure context, so development
		// still works; anything else must be HTTPS.
		secure: process.env.NODE_ENV === 'production',
		path: COOKIE_PATH,
		maxAge: ttlDays * 24 * 60 * 60 * 1000,
	});
}

export function clearRefreshCookie(res: Response): void {
	res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
}

/**
 * Express only populates req.cookies with cookie-parser installed, and this
 * needs exactly one value whose charset is base64url — so parsing it here is
 * cheaper than a dependency.
 */
export function readRefreshCookie(req: Request): string | undefined {
	const header = req.headers.cookie;

	if (!header) {
		return undefined;
	}

	for (const part of header.split(';')) {
		const [name, ...value] = part.trim().split('=');

		if (name === REFRESH_COOKIE) {
			return value.join('=') || undefined;
		}
	}

	return undefined;
}
