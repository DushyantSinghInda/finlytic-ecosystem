import { Module } from '@nestjs/common';
import { GmailProvider } from './providers/gmail.provider';

@Module({
	providers: [GmailProvider],
	exports: [GmailProvider],
})
export class MailModule {}
