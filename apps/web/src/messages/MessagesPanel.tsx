import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessages } from './queries';

function formatSender(name: string | null, address: string | null): string {
	return name ?? address ?? 'unknown sender';
}

export function MessagesPanel({ accountId }: { accountId: string | null }) {
	const messages = useMessages(accountId);

	if (!accountId) {
		return (
			<p className="text-muted-foreground text-sm">
				Select a mailbox to see its messages.
			</p>
		);
	}

	if (messages.isPending) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
			</div>
		);
	}

	if (messages.isError) {
		return (
			<Alert variant="destructive">
				<AlertTitle>{messages.error.message}</AlertTitle>
			</Alert>
		);
	}

	// Flattened here rather than in the query, so the pages stay inspectable in
	// devtools and a refetch of page 1 does not disturb the rest.
	const rows = messages.data.pages.flatMap((page) => page.messages);

	if (rows.length === 0) {
		return (
			<Alert>
				<AlertTitle>No messages ingested yet</AlertTitle>
			</Alert>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<Card className="divide-border divide-y py-0">
				{rows.map((message) => (
					<article key={message.id} className="flex flex-col gap-1 p-4">
						<div className="flex items-baseline justify-between gap-4">
							<span className="truncate text-sm font-medium">
								{formatSender(message.fromName, message.fromAddress)}
							</span>
							<time className="text-muted-foreground shrink-0 text-xs">
								{new Date(message.sentAt).toLocaleString()}
							</time>
						</div>

						<p className="truncate text-sm">
							{message.subject ?? <span className="italic">no subject</span>}
							{message.hasAttachments && (
								<span className="text-muted-foreground ml-2 text-xs">
									📎
								</span>
							)}
						</p>

						{message.snippet && (
							<p className="text-muted-foreground line-clamp-2 text-xs">
								{message.snippet}
							</p>
						)}
					</article>
				))}
			</Card>

			{messages.hasNextPage && (
				<Button
					variant="outline"
					size="sm"
					className="self-start"
					disabled={messages.isFetchingNextPage}
					onClick={() => void messages.fetchNextPage()}
				>
					{messages.isFetchingNextPage ? 'Loading…' : 'Load more'}
				</Button>
			)}
		</div>
	);
}