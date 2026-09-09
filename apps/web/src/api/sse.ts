export interface SseFrame {
	event: string | null;
	data: string | null;
}

const FRAME_SEPARATOR = '\n\n';

/**
 * Takes whatever frames are complete out of the buffer and returns the rest.
 * Network chunks split wherever TCP feels like it, so a frame routinely arrives
 * in two pieces and the remainder has to survive until the next read.
 */
export function splitFrames(buffer: string): { frames: string[]; rest: string } {
	const frames: string[] = [];
	let rest = buffer;
	let boundary = rest.indexOf(FRAME_SEPARATOR);

	while (boundary !== -1) {
		frames.push(rest.slice(0, boundary));
		rest = rest.slice(boundary + FRAME_SEPARATOR.length);
		boundary = rest.indexOf(FRAME_SEPARATOR);
	}

	return { frames, rest };
}

/** Null for a frame carrying no data — a heartbeat comment, or an event name alone. */
export function parseFrame(frame: string): SseFrame | null {
	let event: string | null = null;
	const data: string[] = [];

	for (const rawLine of frame.split('\n')) {
		// Tolerate CRLF: the server sends LF, but a proxy may rewrite endings.
		const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

		// A line starting with ':' is a comment — that is what the heartbeat is.
		if (line === '' || line.startsWith(':')) {
			continue;
		}

		const colon = line.indexOf(':');
		const field = colon === -1 ? line : line.slice(0, colon);
		// Split on the FIRST colon only: the value is usually JSON, which is
		// full of them. One optional space after the colon is part of the format.
		let value = colon === -1 ? '' : line.slice(colon + 1);

		if (value.startsWith(' ')) {
			value = value.slice(1);
		}

		if (field === 'event') {
			event = value;
		} else if (field === 'data') {
			data.push(value);
		}
	}

	return data.length > 0 ? { event, data: data.join('\n') } : null;
}