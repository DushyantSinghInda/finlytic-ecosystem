import { Alert, AlertTitle } from '@/components/ui/alert';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessage } from './queries';

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

	return (
		<Sheet
			open={messageId !== null}
			onOpenChange={(open) => {
				if (!open) {
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

				{message.isSuccess && (
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