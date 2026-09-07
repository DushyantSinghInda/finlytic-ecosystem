import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';

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
			// Heartbeats are comments — a line starting with ':' and no data.
			const data = frame
				.split('\n')
				.filter((line) => line.startsWith('data:'))
				.map((line) => line.slice('data:'.length).trim())
				.join('\n');

			if (!data) {
				return;
			}

			const event = JSON.parse(data) as SyncEvent;

			// The worker has finished, so lastSyncedAt and status are both stale.
			void queryClient.invalidateQueries({ queryKey: ['accounts'] });

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

				// Frames are separated by a blank line. A partial frame stays in
				// the buffer until the rest of it arrives — chunk boundaries have
				// nothing to do with message boundaries.
				let boundary = buffer.indexOf('\n\n');

				while (boundary !== -1) {
					handleFrame(buffer.slice(0, boundary));
					buffer = buffer.slice(boundary + 2);
					boundary = buffer.indexOf('\n\n');
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