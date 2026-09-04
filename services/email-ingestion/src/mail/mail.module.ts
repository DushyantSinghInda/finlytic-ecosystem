import { Module } from '@nestjs/common';
import { GmailProvider } from './providers/gmail.provider';
import { MailProviderRegistry } from './mail-provider.registry';
import { ZohoProvider } from './providers/zoho.provider';

@Module({
	providers: [GmailProvider, ZohoProvider, MailProviderRegistry],
	exports: [MailProviderRegistry],
})
export class MailModule {}
