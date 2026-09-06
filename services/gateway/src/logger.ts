export type Level = 'debug' | 'info' | 'warn' | 'error';

/**
 * One JSON object per line, written straight to stdout. A single write keeps
 * lines from interleaving under concurrency, and one stream keeps ordering
 * intact — Docker captures stdout and stderr separately, so splitting them
 * scrambles the sequence of a request that both logged and failed.
 */
export function log(
	level: Level,
	msg: string,
	fields: Record<string, unknown> = {},
): void {
	process.stdout.write(
		`${JSON.stringify({
			ts: new Date().toISOString(),
			level,
			service: 'gateway',
			msg,
			...fields,
		})}\n`,
	);
}
