import { Module } from '@nestjs/common';
import { GmailProvider } from './providers/gmail.provider';
import { MailProviderRegistry } from './mail-provider.registry';

@Module({
	providers: [GmailProvider, MailProviderRegistry],
	exports: [MailProviderRegistry, GmailProvider],
})
export class MailModule {}
