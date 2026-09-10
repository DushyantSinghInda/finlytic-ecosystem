import {
	Injectable,
	Logger,
	type OnModuleDestroy,
	type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueEvents } from 'bullmq';
import { MAIL_SYNC_QUEUE } from './queue.constants.js';

export interface SyncEvent {
	accountId: string;
	outcome: 'completed' | 'failed';
}

type Listener = (event: SyncEvent) => void;

@Injectable()
export class SyncEventsService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(SyncEventsService.name);
	private readonly listeners = new Set<Listener>();
	private events?: QueueEvents;

	constructor(private readonly configService: ConfigService) {}

	onModuleInit(): void {
		// One Redis subscriber for the whole process, fanned out in memory. A
		// subscriber connection per browser tab would exhaust Redis quickly.
		this.events = new QueueEvents(MAIL_SYNC_QUEUE, {
			connection: {
				host: this.configService.get<string>('REDIS_HOST'),
				port: this.configService.get<number>('REDIS_PORT'),
				password: this.configService.get<string>('REDIS_PASSWORD'),
			},
		});

		this.events.on('completed', ({ jobId }) =>
			this.publish(jobId, 'completed'),
		);
		this.events.on('failed', ({ jobId }) => this.publish(jobId, 'failed'));

		this.logger.log('Subscribed to mail-sync queue events');
	}

	async onModuleDestroy(): Promise<void> {
		await this.events?.close();
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);

		return () => {
			this.listeners.delete(listener);
		};
	}

	private publish(jobId: string, outcome: SyncEvent['outcome']): void {
		// SyncQueueService names jobs `sync-<accountId>`, which is why the event
		// can identify an account without a lookup.
		const accountId = jobId.startsWith('sync-')
			? jobId.slice('sync-'.length)
			: null;

		if (!accountId) {
			return;
		}

		for (const listener of this.listeners) {
			listener({ accountId, outcome });
		}
	}
}
