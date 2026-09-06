export interface Rule {
	id: string;
	method?: string;
	pattern: RegExp;
	max: number;
}

export interface Decision {
	allowed: boolean;
	limit: number;
	remaining: number;
	retryAfterSeconds: number;
}

export const WINDOW_MS = 60_000;

// The limits @nestjs/throttler enforced inside the services, moved to the edge
// unchanged: same numbers, same one-minute window, one bucket per rule so that
// two paths matching the same rule share a counter.
const RULES: Rule[] = [
	{ id: 'auth-login', method: 'POST', pattern: /^\/auth\/login$/, max: 5 },
	{
		id: 'auth-register',
		method: 'POST',
		pattern: /^\/auth\/register$/,
		max: 5,
	},
	{ id: 'auth-refresh', method: 'POST', pattern: /^\/auth\/refresh$/, max: 20 },
	{
		id: 'account-actions',
		method: 'POST',
		pattern: /^\/accounts\/[^/]+\/(preview|sync)$/,
		max: 10,
	},
];

const DEFAULT_RULE: Rule = { id: 'default', pattern: /.*/, max: 100 };

export function ruleFor(method: string, pathname: string): Rule {
	return (
		RULES.find(
			(rule) =>
				(rule.method === undefined || rule.method === method) &&
				rule.pattern.test(pathname),
		) ?? DEFAULT_RULE
	);
}

interface Counter {
	windowStart: number;
	count: number;
}

/**
 * Fixed window, matching what the services enforced before. It allows a burst
 * across a window boundary — up to 2x the limit in a short span — which is the
 * cost of keeping the behaviour identical to what it replaces.
 *
 * State is in this process, so the counts are per gateway instance. Running
 * more than one gateway would need shared storage.
 */
export function createRateLimiter(windowMs: number = WINDOW_MS) {
	const counters = new Map<string, Counter>();

	return {
		check(
			client: string,
			method: string,
			pathname: string,
			now: number = Date.now(),
		): Decision {
			const rule = ruleFor(method, pathname);
			const key = `${client}|${rule.id}`;
			const counter = counters.get(key);

			if (!counter || now - counter.windowStart >= windowMs) {
				counters.set(key, { windowStart: now, count: 1 });

				return {
					allowed: true,
					limit: rule.max,
					remaining: rule.max - 1,
					retryAfterSeconds: 0,
				};
			}

			counter.count += 1;

			const allowed = counter.count <= rule.max;
			const elapsed = now - counter.windowStart;

			return {
				allowed,
				limit: rule.max,
				remaining: Math.max(rule.max - counter.count, 0),
				retryAfterSeconds: allowed ? 0 : Math.ceil((windowMs - elapsed) / 1000),
			};
		},

		// A counter is worthless once its window has passed, and without a sweep
		// the map grows by one entry per distinct client address ever seen.
		prune(now: number = Date.now()): void {
			for (const [key, counter] of counters) {
				if (now - counter.windowStart >= windowMs) {
					counters.delete(key);
				}
			}
		},

		size(): number {
			return counters.size;
		},
	};
}
