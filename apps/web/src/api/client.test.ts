import { describe, expect, it, vi } from 'vitest'

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

const session = {
	accessToken: 'access-1',
	tokenType: 'Bearer',
	expiresIn: 900,
	user: {
		id: 'user-1',
		email: 'a@b.com',
		role: 'USER',
		isActive: true,
		createdAt: '2026-01-01T00:00:00.000Z',
	},
};

// The module holds the access token and the in-flight refresh in closure state,
// so each test imports a fresh copy rather than inheriting the last one's.
async function freshClient() {
	vi.resetModules();

	return import('./client');
}

function headersOf(call: unknown[]): Headers {
	return (call[1] as RequestInit).headers as Headers;
}

describe('apiFetch', () => {
	it('sends no Authorization header before sign-in', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
		vi.stubGlobal('fetch', fetchMock);

		const { apiFetch } = await freshClient();
		await apiFetch('/api/users/me');

		expect(headersOf(fetchMock.mock.calls[0]).get('authorization')).toBeNull();
	});

	it('attaches the access token once signed in', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
		vi.stubGlobal('fetch', fetchMock);

		const { apiFetch, setAccessToken } = await freshClient();
		setAccessToken('access-1');
		await apiFetch('/api/users/me');

		expect(headersOf(fetchMock.mock.calls[0]).get('authorization')).toBe(
			'Bearer access-1',
		);
	});

	it('refreshes and retries once after a 401', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({}, 401))
			.mockResolvedValueOnce(jsonResponse(session))
			.mockResolvedValueOnce(jsonResponse({ ok: true }));
		vi.stubGlobal('fetch', fetchMock);

		const { apiFetch } = await freshClient();
		const response = await apiFetch('/api/users/me');

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh');
	});

	it('does not loop when the retried request also 401s', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({}, 401))
			.mockResolvedValueOnce(jsonResponse(session))
			.mockResolvedValueOnce(jsonResponse({}, 401));
		vi.stubGlobal('fetch', fetchMock);

		const { apiFetch } = await freshClient();
		const response = await apiFetch('/api/users/me');

		// Three calls, not an endless chain: a fresh token that is still rejected
		// means the session is gone, and retrying only spends more of them.
		expect(response.status).toBe(401);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('throws UnauthenticatedError when the refresh itself fails', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({}, 401))
			.mockResolvedValueOnce(jsonResponse({}, 401));
		vi.stubGlobal('fetch', fetchMock);

		const { apiFetch, UnauthenticatedError } = await freshClient();

		await expect(apiFetch('/api/users/me')).rejects.toBeInstanceOf(
			UnauthenticatedError,
		);
	});
});

describe('refreshSession', () => {
	it('shares one request across concurrent callers', async () => {
		let release!: (value: Response) => void;
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					release = resolve;
				}),
		);
		vi.stubGlobal('fetch', fetchMock);

		const { refreshSession } = await freshClient();

		const first = refreshSession();
		const second = refreshSession();
		const third = refreshSession();

		// Rotation makes a second presentation of the same token look like theft,
		// and the server answers by revoking the whole family. Three callers have
		// to produce exactly one request.
		expect(fetchMock).toHaveBeenCalledTimes(1);

		release(jsonResponse(session));
		const results = await Promise.all([first, second, third]);

		expect(results.map((result) => result?.accessToken)).toEqual([
			'access-1',
			'access-1',
			'access-1',
		]);
	});

	it('starts a new request once the previous one settles', async () => {
		// A factory, not a value: each call needs its own Response, because a
		// body is a stream that can only be read once.
		const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(session)));
		vi.stubGlobal('fetch', fetchMock);

		const { refreshSession } = await freshClient();

		await refreshSession();
		await refreshSession();

		// Shared while in flight, not cached forever.
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('clears the stale token when the refresh is rejected', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 401));
		vi.stubGlobal('fetch', fetchMock);

		const { apiFetch, refreshSession, setAccessToken } = await freshClient();
		setAccessToken('stale');

		expect(await refreshSession()).toBeNull();

		fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
		await apiFetch('/api/users/me');

		// A token the server has rejected must not be attached to anything else.
		expect(
			headersOf(fetchMock.mock.calls.at(-1) as unknown[]).get('authorization'),
		).toBeNull();
	});
});