import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestStore {
	requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

/** Runs fn, and everything it awaits, with this request id attached. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
	return storage.run({ requestId }, fn);
}

/** Undefined outside a request — worker jobs and startup have no id. */
export function currentRequestId(): string | undefined {
	return storage.getStore()?.requestId;
}
