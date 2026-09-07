import type { PublicUser } from '@finlytic/shared-types';

export interface Session {
	accessToken: string;
	tokenType: 'Bearer';
	expiresIn: number;
	user: PublicUser;
}

// In memory, never localStorage. An XSS can read localStorage; it cannot read
// a variable in a module closure any more easily than it can call this API,
// and this token expires in minutes. It dies on reload, which is fine — the
// httpOnly refresh cookie is what restores the session.
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
	accessToken = token;
}

export class UnauthenticatedError extends Error { }

function withToken(input: string, init: RequestInit): Promise<Response> {
	const headers = new Headers(init.headers);

	if (accessToken) {
		headers.set('authorization', `Bearer ${accessToken}`);
	}

	return fetch(input, { ...init, headers });
}

let refreshInFlight: Promise<Session | null> | null = null;

/**
 * Every caller shares one in-flight refresh. Two concurrent calls would present
 * the same rotating token twice, which the server correctly reads as theft and
 * answers by revoking the whole session family.
 */
export function refreshSession(): Promise<Session | null> {
	refreshInFlight ??= (async (): Promise<Session | null> => {
		const response = await fetch('/api/auth/refresh', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		});

		if (!response.ok) {
			setAccessToken(null);
			return null;
		}

		const session = (await response.json()) as Session;
		setAccessToken(session.accessToken);

		return session;
	})().finally(() => {
		refreshInFlight = null;
	});

	return refreshInFlight;
}

export async function apiFetch(
	input: string,
	init: RequestInit = {},
): Promise<Response> {
	const response = await withToken(input, init);

	if (response.status !== 401) {
		return response;
	}

	// One retry, never a loop: if the fresh token is rejected too, the session
	// is genuinely gone and looping would just spend more of them.
	const session = await refreshSession();

	if (!session) {
		throw new UnauthenticatedError('Session expired');
	}

	return withToken(input, init);
}

export async function apiJson<T>(
	input: string,
	init: RequestInit = {},
): Promise<T> {
	const response = await apiFetch(input, init);

	if (!response.ok) {
		throw new Error(`${init.method ?? 'GET'} ${input} → ${response.status}`);
	}

	return (await response.json()) as T;
}

export async function login(email: string, password: string): Promise<Session> {
	const response = await fetch('/api/auth/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password }),
	});

	if (!response.ok) {
		throw new Error('Invalid email or password');
	}

	const session = (await response.json()) as Session;
	setAccessToken(session.accessToken);

	return session;
}

export async function logout(): Promise<void> {
	await fetch('/api/auth/logout', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{}',
	});

	setAccessToken(null);
}