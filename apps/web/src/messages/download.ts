import { apiFetch } from '@/api/client';

/**
 * Fetches the original message and hands it to the browser as a file.
 *
 * A plain <a href> cannot do this. A navigation carries no Authorization
 * header — the access token lives in a module closure, not a cookie — so the
 * gateway would answer 401 and the user would save that. Putting the token in
 * the query string instead writes a credential into browser history and every
 * log between here and the service, which is the same reason the sync stream
 * is parsed from fetch rather than EventSource.
 */
export async function downloadMessage(
	accountId: string,
	messageId: string,
): Promise<void> {
	const response = await apiFetch(
		`/api/accounts/${accountId}/messages/${messageId}/raw`,
	);

	if (!response.ok) {
		// Without this check the *error body* is what gets saved: a .eml file
		// containing {"statusCode":404,…}, named like a real message. A blob
		// does not care what status it arrived with.
		throw new Error(
			response.status === 404
				? 'The original message is no longer stored'
				: 'Could not download the original message',
		);
	}

	// The whole message lands in memory. The server streams it; the browser
	// cannot stream to disk without the File System Access API, which is
	// Chromium-only. Acceptable for mail, wrong for arbitrary large files.
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);

	const link = document.createElement('a');
	link.href = url;
	// The server sends a Content-Disposition filename and this path ignores it —
	// a blob: URL has no headers. The download attribute is the only name the
	// browser sees, so the convention is deliberately duplicated here.
	link.download = `message-${messageId}.eml`;
	link.click();

	// Not revoked in the same tick: the click only *starts* the download, and
	// pulling the URL out from under it has historically cancelled it. An object
	// URL left alive pins the entire message in memory until reload.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}