import { Injectable, NotFoundException } from '@nestjs/common';
import { MailProvider } from '../generated/prisma/client';
import { GmailProvider } from './providers/gmail.provider';
import type { MailProviderAdapter } from './providers/mail-provider.interface';
import { ZohoProvider } from './providers/zoho.provider';

@Injectable()
export class MailProviderRegistry {
	private readonly adapters = new Map<MailProvider, MailProviderAdapter>();

	constructor(gmail: GmailProvider, zoho: ZohoProvider) {
		this.adapters.set(MailProvider.GMAIL, gmail);
		this.adapters.set(MailProvider.ZOHO, zoho);
	}

	get(provider: MailProvider): MailProviderAdapter {
		const adapter = this.adapters.get(provider);

		if (!adapter) {
			throw new Error(`No adapter registered for provider ${provider}`);
		}

		return adapter;
	}

	/** Maps a URL path segment ('gmail') to a provider that actually has an adapter. */
	resolve(slug: string): {
		provider: MailProvider;
		adapter: MailProviderAdapter;
	} {
		const key = slug.toUpperCase();
		const isKnown = (Object.values(MailProvider) as string[]).includes(key);
		const provider = isKnown ? (key as MailProvider) : undefined;
		const adapter = provider && this.adapters.get(provider);

		// The enum can name a provider before an adapter exists for it, so the map
		// is what decides.
		if (!provider || !adapter) {
			throw new NotFoundException(`Unknown mail provider '${slug}'`);
		}

		return { provider, adapter };
	}
}
