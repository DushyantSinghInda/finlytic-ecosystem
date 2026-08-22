import { Injectable } from '@nestjs/common';
import { MailProvider } from '../generated/prisma/client';
import { GmailProvider } from './providers/gmail.provider';
import type { MailProviderAdapter } from './providers/mail-provider.interface';

@Injectable()
export class MailProviderRegistry {
	private readonly adapters = new Map<MailProvider, MailProviderAdapter>();

	constructor(gmail: GmailProvider) {
		this.adapters.set(MailProvider.GMAIL, gmail);
	}

	get(provider: MailProvider): MailProviderAdapter {
		const adapter = this.adapters.get(provider);

		if (!adapter) {
			throw new Error(`No adapter registered for provider ${provider}`);
		}

		return adapter;
	}
}
