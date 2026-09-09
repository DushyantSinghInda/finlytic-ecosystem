import { jest } from '@jest/globals';
import { PassThrough, Readable } from 'node:stream';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedUser } from '@finlytic/auth-lib';
import { MessagesController } from './messages.controller.js';
import type { MessagesService } from './messages.service.js';
import type { ObjectStorageService } from '../storage/object-storage.service.js';

const USER = { id: 'user-1' } as AuthenticatedUser;
const ACCOUNT_ID = 'acc-1';
const MESSAGE_ID = 'msg-1';
const KEY = 'raw/acc-1/msg-1';

// A real Writable, not a mock: `pipeline` has to actually move bytes into
// something, and a stub that only records calls would pass even if the
// plumbing were wrong.
function fakeResponse() {
	const sink = new PassThrough();
	const chunks: Buffer[] = [];
	sink.on('data', (chunk: Buffer) => chunks.push(chunk));

	const writeHead = jest.fn();
	const res = Object.assign(sink, { writeHead }) as unknown as Response;

	return {
		res,
		writeHead,
		received: () => Buffer.concat(chunks).toString('utf8'),
	};
}

describe('MessagesController raw download', () => {
	const rawObjectKeyFor =
		jest.fn<
			(userId: string, accountId: string, messageId: string) => Promise<string>
		>();
	const getStream = jest.fn<
		(key: string) => Promise<{
			body: Readable;
			contentLength: number | undefined;
		}>
	>();

	const messages = { rawObjectKeyFor } as unknown as MessagesService;
	const storage = { getStream } as unknown as ObjectStorageService;
	const controller = new MessagesController(messages, storage);

	beforeEach(() => {
		jest.clearAllMocks();
		rawObjectKeyFor.mockResolvedValue(KEY);
	});

	it('streams the object as a named attachment', async () => {
		getStream.mockResolvedValue({
			body: Readable.from(['From: a@example.com\r\n', 'Subject: hi\r\n']),
			contentLength: 34,
		});

		const { res, writeHead, received } = fakeResponse();

		// Called directly, so ParseUUIDPipe never runs — the ids are strings
		// here. Pipe behaviour is Nest's to test, not ours.
		await controller.raw(USER, ACCOUNT_ID, MESSAGE_ID, res);

		expect(getStream).toHaveBeenCalledWith(KEY);
		expect(writeHead).toHaveBeenCalledWith(
			200,
			expect.objectContaining({
				'content-type': 'message/rfc822',
				'content-disposition': `attachment; filename="message-${MESSAGE_ID}.eml"`,
				'content-length': 34,
			}),
		);
		expect(received()).toBe('From: a@example.com\r\nSubject: hi\r\n');
	});

	it('omits content-length when storage does not report one', async () => {
		getStream.mockResolvedValue({
			body: Readable.from(['x']),
			contentLength: undefined,
		});

		const { res, writeHead } = fakeResponse();

		await controller.raw(USER, ACCOUNT_ID, MESSAGE_ID, res);

		// No length means chunked transfer, which is correct. A wrong length
		// would be worse: the client would wait for bytes that never arrive.
		expect(writeHead.mock.calls[0]?.[1]).not.toHaveProperty('content-length');
	});

	it('answers 404 when the object has drifted away', async () => {
		const missing = Object.assign(new Error('NoSuchKey'), {
			name: 'NoSuchKey',
		});
		getStream.mockRejectedValue(missing);

		const { res, writeHead } = fakeResponse();

		await expect(
			controller.raw(USER, ACCOUNT_ID, MESSAGE_ID, res),
		).rejects.toBeInstanceOf(NotFoundException);

		// Nothing was written, so the exception filter still owns the response.
		expect(writeHead).not.toHaveBeenCalled();
	});

	it('answers 503 when storage is unreachable', async () => {
		// The distinction that matters: a missing object is permanent and a dead
		// MinIO is not. Reporting both as 404 sends the next person debugging
		// Postgres when the problem is a container.
		getStream.mockRejectedValue(new Error('connect ECONNREFUSED'));

		const { res } = fakeResponse();

		await expect(
			controller.raw(USER, ACCOUNT_ID, MESSAGE_ID, res),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
	});

	it('never reaches storage for a message the caller does not own', async () => {
		rawObjectKeyFor.mockRejectedValue(
			new NotFoundException('Message not found'),
		);

		const { res } = fakeResponse();

		await expect(
			controller.raw(USER, ACCOUNT_ID, MESSAGE_ID, res),
		).rejects.toBeInstanceOf(NotFoundException);

		// Ownership is settled before a single byte is requested.
		expect(getStream).not.toHaveBeenCalled();
	});

	it('drops the connection when the stream fails after the headers are out', async () => {
		getStream.mockResolvedValue({
			body: Readable.from(
				(function* () {
					yield Buffer.from('From: a@example.com\r\n');
					throw new Error('MinIO went away');
				})(),
			),
			contentLength: 999,
		});

		const { res, writeHead } = fakeResponse();

		// The whole point: a mid-flight failure resolves quietly instead of
		// raising an unhandled 'error' event that would take the process down.
		await expect(
			controller.raw(USER, ACCOUNT_ID, MESSAGE_ID, res),
		).resolves.toBeUndefined();

		expect(writeHead).toHaveBeenCalled();
		expect(res.destroyed).toBe(true);
	});
});
