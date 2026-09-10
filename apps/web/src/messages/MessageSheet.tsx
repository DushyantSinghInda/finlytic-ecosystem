import { Alert, AlertTitle } from '@/components/ui/alert';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useDownloadMessage, useMessage } from './queries';
import { Button } from '@/components/ui/button';

export function MessageSheet({
	accountId,
	messageId,
	onClose,
}: {
	accountId: string | null;
	messageId: string | null;
	onClose: () => void;
}) {
	const message = useMessage(accountId, messageId);
	const download = useDownloadMessage();

	return (
		<Sheet
			open={messageId !== null}
			onOpenChange={(open) => {
				if (!open) {
					download.reset();
					onClose();
				}
			}}
		>
			<SheetContent side="right" className="flex w-full flex-col sm:max-w-2xl">
				{message.isPending && (
					<div className="flex flex-col gap-3 p-6">
						<Skeleton className="h-6 w-2/3" />
						<Skeleton className="h-40 w-full" />
					</div>
				)}

				{message.isError && (
					<div className="p-6">
						<Alert variant="destructive">
							<AlertTitle>{message.error.message}</AlertTitle>
						</Alert>
					</div>
				)}

				{message.isSuccess && accountId && messageId && (
					<>
						<SheetHeader>
							<SheetTitle className="text-base leading-snug">
								{message.data.subject ?? 'No subject'}
							</SheetTitle>
							<SheetDescription className="text-xs">
								{message.data.fromName ?? message.data.fromAddress ?? 'unknown'}
								{' · '}
								{new Date(message.data.sentAt).toLocaleString()}
							</SheetDescription>
						</SheetHeader>

						<p className="text-muted-foreground px-4 text-xs">
							to {message.data.toAddresses.join(', ') || '—'}
						</p>
						<div className="px-4">
							<Button
								size="sm"
								variant="outline"
								disabled={download.isPending}
								onClick={() =>
									download.mutate({ accountId, messageId })
								}
							>
								{download.isPending ? 'Preparing…' : 'Download original'}
							</Button>

							{download.isError && (
								<p className="text-destructive mt-2 text-xs">
									{download.error.message}
								</p>
							)}
						</div>
						<div className="flex-1 overflow-y-auto px-4 pb-6">
							{message.data.bodyText ? (
								/* Plain text, never dangerouslySetInnerHTML — this is
									 content a stranger emailed you. */
								<pre className="font-sans text-sm wrap-break-word whitespace-pre-wrap">
									{message.data.bodyText}
								</pre>
							) : (
								<p className="text-muted-foreground text-sm italic">
									No readable text body — the message may be HTML-only, or the
									stored object is missing.
								</p>
							)}

							{message.data.bodyTruncated && (
								<p className="text-muted-foreground mt-6 text-xs">
									Truncated at 256 KB.
								</p>
							)}
						</div>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}