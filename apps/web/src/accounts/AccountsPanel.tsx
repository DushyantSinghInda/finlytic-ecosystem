import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw } from 'lucide-react';
import type { AccountStatus } from '@finlytic/shared-types';
import { useAccounts, useRequestSync } from './queries';
import { cn } from 'cn';

const statusLabel: Record<AccountStatus, string | null> = {
	// ACTIVE is the norm — a badge on every row is noise that makes the two
	// rows that actually need attention harder to spot.
	ACTIVE: null,
	REAUTH_REQUIRED: 'reconnect',
	DISABLED: 'disabled',
};

const statusVariant: Record<AccountStatus, 'default' | 'secondary' | 'destructive'> = {
	ACTIVE: 'default',
	REAUTH_REQUIRED: 'destructive',
	DISABLED: 'secondary',
};

function formatSyncedAt(value: string | null): string {
	if (!value) return 'never synced';

	return `synced ${new Date(value).toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})}`;
}

export function AccountsPanel({
	selectedId,
	onSelect,
}: {
	selectedId: string | null;
	onSelect: (accountId: string) => void;
}) {
	const accounts = useAccounts();
	const requestSync = useRequestSync();

	if (accounts.isPending) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
			</div>
		);
	}

	if (accounts.isError) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Could not load accounts</AlertTitle>
				<AlertDescription>{accounts.error.message}</AlertDescription>
			</Alert>
		);
	}

	if (accounts.data.length === 0) {
		return (
			<Alert>
				<AlertTitle>No mailboxes connected</AlertTitle>
				<AlertDescription>
					Visit <code>/oauth/gmail/authorize</code> in this tab to connect one.
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<Card className="divide-border divide-y py-0">
			{accounts.data.map((account) => {
				// Per-row pending state: only the row being synced shows it.
				const syncing =
					requestSync.isPending && requestSync.variables === account.id;

				const queued =
					requestSync.isSuccess &&
					requestSync.variables === account.id &&
					requestSync.data.alreadyQueued;

				const label = statusLabel[account.status];

				return (
					<div key={account.id} className="flex flex-col">
						{/* Two sibling buttons, not a button inside a clickable div.
                                                  That nesting is what forced the old stopPropagation call —
                                                  and it left the row unreachable by keyboard, because a div
                                                  with onClick is not focusable and ignores Enter and Space. */}
						<div className="flex items-center gap-1 pr-2">
							<button
								type="button"
								aria-current={selectedId === account.id}
								onClick={() => onSelect(account.id)}
								className={cn(
									'min-w-0 flex-1 rounded-l-xl px-3 py-2.5 text-left',
									'transition-colors outline-none',
									'hover:bg-muted/40 aria-[current=true]:bg-muted/60',
									'focus-visible:ring-3 focus-visible:ring-ring/50',
								)}
							>
								<div className="flex items-center gap-2">
									<span className="truncate text-sm font-medium">
										{account.emailAddress}
									</span>
									{label && (
										<Badge
											variant={statusVariant[account.status]}
											className="shrink-0"
										>
											{label}
										</Badge>
									)}
								</div>

								<p className="text-muted-foreground mt-0.5 truncate text-xs">
									{account.provider.toLowerCase()} ·{' '}
									{formatSyncedAt(account.lastSyncedAt)}
								</p>
							</button>

							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Sync ${account.emailAddress}`}
								disabled={syncing || account.status !== 'ACTIVE'}
								onClick={() => requestSync.mutate(account.id)}
							>
								<RefreshCw
									className={syncing ? 'animate-spin' : undefined}
									aria-hidden
								/>
							</Button>
						</div>

						{queued && (
							<p className="text-muted-foreground px-3 pb-2 text-xs">
								already queued
							</p>
						)}
					</div>
				);
			})}
		</Card>
	);
}