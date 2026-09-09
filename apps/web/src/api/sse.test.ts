import { describe, expect, it } from 'vitest';
import { parseFrame, splitFrames } from './sse';

describe('splitFrames', () => {
	it('takes one complete frame and keeps nothing back', () => {
		expect(splitFrames('data: one\n\n')).toEqual({
			frames: ['data: one'],
			rest: '',
		});
	});

	it('holds an incomplete frame until the rest arrives', () => {
		// The half a frame that a chunk boundary leaves behind.
		const first = splitFrames('data: {"a":');

		expect(first.frames).toEqual([]);
		expect(first.rest).toBe('data: {"a":');

		const second = splitFrames(`${first.rest}1}\n\n`);

		expect(second.frames).toEqual(['data: {"a":1}']);
		expect(second.rest).toBe('');
	});

	it('takes several frames out of one chunk', () => {
		const { frames, rest } = splitFrames(': ping\n\ndata: one\n\ndata: tw');

		expect(frames).toEqual([': ping', 'data: one']);
		expect(rest).toBe('data: tw');
	});

	it('returns nothing for an empty buffer', () => {
		expect(splitFrames('')).toEqual({ frames: [], rest: '' });
	});
});

describe('parseFrame', () => {
	it('reads an event name and its data', () => {
		expect(parseFrame('event: sync\ndata: {"accountId":"a1"}')).toEqual({
			event: 'sync',
			data: '{"accountId":"a1"}',
		});
	});

	it('ignores a heartbeat comment', () => {
		// Every 15 seconds, forever — the parser must not treat it as an event.
		expect(parseFrame(': ping')).toBeNull();
	});

	it('ignores an event with no data', () => {
		expect(parseFrame('event: sync')).toBeNull();
	});

	it('keeps colons inside the value', () => {
		// JSON is full of colons; splitting on all of them would shred the payload.
		expect(parseFrame('data: {"at":"10:30","id":"x"}')?.data).toBe(
			'{"at":"10:30","id":"x"}',
		);
	});

	it('joins multi-line data with newlines', () => {
		expect(parseFrame('data: line one\ndata: line two')?.data).toBe(
			'line one\nline two',
		);
	});

	it('accepts a value with no space after the colon', () => {
		expect(parseFrame('data:{"a":1}')?.data).toBe('{"a":1}');
	});

	it('tolerates CRLF line endings', () => {
		expect(parseFrame('event: sync\r\ndata: {"a":1}\r')).toEqual({
			event: 'sync',
			data: '{"a":1}',
		});
	});
});