import type { JsonLogger } from './json-logger.js';

/**
 * Last-resort handlers for errors that escaped every request.
 *
 * Without these, an async throw anywhere outside a try/catch — a rejected
 * promise in a route handler, a stream that emitted 'error' with no listener —
 * terminates the process with a raw stack on stderr and nothing in the
 * structured log. Under `restart: unless-stopped` that reads as a momentary
 * blip rather than an outage.
 */
export function installCrashHandlers(logger: JsonLogger): void {
	const die =
		(kind: 'uncaughtException' | 'unhandledRejection') =>
		(reason: unknown): void => {
			const error =
				reason instanceof Error ? reason : new Error(String(reason));

			logger.error(error, error.stack, kind);

			// Non-zero deliberately. `restart: unless-stopped` restarts a clean
			// exit too, so exiting 0 here would surface as `Restarting (0)` —
			// indistinguishable from a wrong CMD — instead of a crash.
			process.exitCode = 1;

			// stdout is a pipe under Docker and its writes are not guaranteed to
			// flush before exit. The whole point of this handler is the log line,
			// so it gets a moment to leave before the process does.
			setTimeout(() => process.exit(1), 50);
		};

	// Node keeps running after a handled uncaughtException, so the exit above is
	// ours to make: continuing on unknown state is how one bad request becomes
	// corrupt data.
	process.on('uncaughtException', die('uncaughtException'));
	process.on('unhandledRejection', die('unhandledRejection'));
}
