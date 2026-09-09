import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { parseFrame, splitFrames } from '@/api/sse';

interface SyncEvent {
	accountId: string;
	outcome: 'completed' | 'failed';
}

export function useSyncEvents(enabled: boolean): void {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!enabled) {
			return;
		}

		const controller = new AbortController();
		let reconnectTimer: number | undefined;
		let attempt = 0;

		function handleFrame(frame: string): void {
			const parsed = parseFrame(frame);

			if (!parsed?.data) {
				return;
			}

			let event: SyncEvent;

			try {
				event = JSON.parse(parsed.data) as SyncEvent;
			} catch {
				// One malformed frame must not take down a stream that will keep
				// delivering good ones.
				return;
			}

			void queryClient.invalidateQueries({ queryKey: ['accounts'] });
			void queryClient.invalidateQueries({
				queryKey: ['messages', event.accountId],
			});

			if (event.outcome === 'failed') {
				console.warn(`sync failed for account ${event.accountId}`);
			}
		}

		async function consume(): Promise<void> {
			const response = await apiFetch('/api/accounts/events', {
				signal: controller.signal,
				headers: { accept: 'text/event-stream' },
			});

			if (!response.ok || !response.body) {
				throw new Error(`stream failed: ${response.status}`);
			}

			// The connection is open, so a later drop is a fresh failure rather
			// than a continuing one.
			attempt = 0;

			const reader = response.body
				.pipeThrough(new TextDecoderStream())
				.getReader();
			let buffer = '';

			for (; ;) {
				const { done, value } = await reader.read();

				if (done) {
					return;
				}

				buffer += value;

				const { frames, rest } = splitFrames(buffer);
				buffer = rest;

				for (const frame of frames) {
					handleFrame(frame);
				}
			}
		}

		function scheduleReconnect(): void {
			if (controller.signal.aborted) {
				return;
			}

			attempt += 1;

			// Capped exponential backoff: a server restart should not turn every
			// open tab into a reconnect storm against a service that is booting.
			const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
			reconnectTimer = window.setTimeout(start, delay);
		}

		function start(): void {
			// A stream that ends cleanly is the same as one that fails: either
			// way there are no more events until we reconnect.
			consume().then(scheduleReconnect).catch(scheduleReconnect);
		}

		start();

		return () => {
			controller.abort();

			if (reconnectTimer !== undefined) {
				window.clearTimeout(reconnectTimer);
			}
		};
	}, [enabled, queryClient]);
}