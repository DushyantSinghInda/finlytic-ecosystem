import { describe, expect, it, vi } from 'vitest';

/**
 * The test environment is `node`, so there is no DOM. This function touches
 * exactly two browser APIs, so those are the two that get faked — anything
 * more and the test starts testing the fake.
 */
function installBrowserFakes() {
	const anchor = { href: '', download: '', click: vi.fn() };

	vi.stubGlobal('document', { createElement: vi.fn(() => anchor) });

	const createObjectURL = vi.fn(() => 'blob:message-bytes');
	const revokeObjectURL = vi.fn();

	// Subclassed rather than replaced with a bare object, so `new URL(...)`
	// keeps working if this module ever grows one.
	vi.stubGlobal(
		'URL',
		class extends URL {
			static createObjectURL = createObjectURL;
			static revokeObjectURL = revokeObjectURL;
		},
	);

	return { anchor, createObjectURL, revokeObjectURL };
}

// A fresh Response per call: a body is a one-shot stream, so a shared instance
// fails the second read with "Body has already been read".
function rawResponse(status = 200): Response {
	return new Response('From: a@example.com\r\nSubject: hi\r\n', {
		status,
		headers: { 'content-type': 'message/rfc822' },
	});
}

// setTimeout(…, 0) fires after the current task. Waiting on a real macrotask
// keeps the ordering assertion honest without a fake clock.
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

// The client holds the access token in module closure state, so both modules
// are imported through the same alias after a reset — otherwise the download
// module and the test would be talking to two different copies of it.
async function freshDownload() {
	vi.resetModules();

	const client = await import('@/api/client');
	const { downloadMessage } = await import('./download');

	return { ...client, downloadMessage };
}

describe('downloadMessage', () => {
	it('requests the raw endpoint with the access token attached', async () => {
		const fetchMock = vi.fn((_input: string, _init: RequestInit) =>
			Promise.resolve(rawResponse()),
		);
		vi.stubGlobal('fetch', fetchMock);
		installBrowserFakes();

		const { downloadMessage, setAccessToken } = await freshDownload();
		setAccessToken('access-1');

		await downloadMessage('acc-1', 'msg-1');

		const [url, init] = fetchMock.mock.calls[0];

		expect(url).toBe('/api/accounts/acc-1/messages/msg-1/raw');
		// The whole reason this is not an <a href>: a navigation would carry no
		// Authorization header and the user would save a 401 body.
		expect((init.headers as Headers).get('authorization')).toBe(
			'Bearer access-1',
		);
		// And the credential stays out of the URL, where history and every log
		// between here and the service would keep a copy.
		expect(url).not.toContain('access-1');
	});

	it('names the file after the message id, never the subject', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(rawResponse())));
		const { anchor, createObjectURL } = installBrowserFakes();

		const { downloadMessage } = await freshDownload();
		await downloadMessage('acc-1', 'msg-1');

		expect(createObjectURL).toHaveBeenCalledOnce();
		expect(anchor.href).toBe('blob:message-bytes');
		// A subject is text an arbitrary stranger chose, and this names a file
		// on the user's disk.
		expect(anchor.download).toBe('message-msg-1.eml');
		expect(anchor.click).toHaveBeenCalledOnce();
	});

	it('revokes the object URL, but not in the click’s own tick', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(rawResponse())));
		const { revokeObjectURL } = installBrowserFakes();

		const { downloadMessage } = await freshDownload();
		await downloadMessage('acc-1', 'msg-1');

		// click() only *starts* the download. Pulling the URL out from under it
		// in the same tick has historically cancelled it.
		expect(revokeObjectURL).not.toHaveBeenCalled();

		await nextTick();

		// And never revoking pins the entire message in memory until reload.
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:message-bytes');
	});

	it('saves nothing when the object is gone', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() =>
				Promise.resolve(
					new Response(JSON.stringify({ statusCode: 404 }), { status: 404 }),
				),
			),
		);
		const { anchor, createObjectURL } = installBrowserFakes();

		const { downloadMessage } = await freshDownload();

		await expect(downloadMessage('acc-1', 'msg-1')).rejects.toThrow(
			'The original message is no longer stored',
		);

		// Drop the response.ok check and this is the line that changes: a .eml
		// file containing {"statusCode":404} written to the user's disk, named
		// like a real message. A blob does not care what status it arrived with.
		expect(createObjectURL).not.toHaveBeenCalled();
		expect(anchor.click).not.toHaveBeenCalled();
	});

	it('distinguishes unreachable storage from a missing object', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve(new Response('', { status: 503 }))),
		);
		const { createObjectURL } = installBrowserFakes();

		const { downloadMessage } = await freshDownload();

		// The server already separates these two: 404 is permanent, 503 is worth
		// retrying. Collapsing them in the UI would throw that away.
		await expect(downloadMessage('acc-1', 'msg-1')).rejects.toThrow(
			'Could not download the original message',
		);
		expect(createObjectURL).not.toHaveBeenCalled();
	});
});