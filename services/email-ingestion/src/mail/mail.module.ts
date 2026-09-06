import { Module } from '@nestjs/common';
import { GmailProvider } from './providers/gmail.provider.js';
import { MailProviderRegistry } from './mail-provider.registry.js';
import { ZohoProvider } from './providers/zoho.provider.js';

@Module({
	providers: [GmailProvider, ZohoProvider, MailProviderRegistry],
	exports: [MailProviderRegistry],
})
export class MailModule {}
