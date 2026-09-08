import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AccountStatus } from '@finlytic/shared-types';
import { useAccounts, useRequestSync } from './queries';

const statusVariant: Record<AccountStatus, 'default' | 'secondary' | 'destructive'> = {
	ACTIVE: 'default',
	REAUTH_REQUIRED: 'destructive',
	DISABLED: 'secondary',
};

function formatSyncedAt(value: string | null): string {
	return value ? new Date(value).toLocaleString() : 'never';
}

export function AccountsPanel({
	selectedId,
	onSelect
}: {
	selectedId: string | null;
	onSelect: (accountId: string) => void;
}) {
	const accounts = useAccounts();
	const requestSync = useRequestSync();

	if (accounts.isPending) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-28 w-full" />
				<Skeleton className="h-28 w-full" />
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
					Connect one at <code>/oauth/gmail/authorize</code>.
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{accounts.data.map((account) => {
				// Per-row pending state: only the row being synced shows it.
				const syncing =
					requestSync.isPending && requestSync.variables === account.id;

				return (
					<Card
						key={account.id}
						onClick={() => onSelect(account.id)}
						className={`cursor-pointer transition-colors ${selectedId === account.id ? 'border-primary' : 'hover:border-muted-foreground/40'
							}`}
					>
						<CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
							<div>
								<CardTitle className="text-base">{account.emailAddress}</CardTitle>
								<p className="text-muted-foreground mt-1 text-sm">
									{account.provider} · last synced {formatSyncedAt(account.lastSyncedAt)}
								</p>
							</div>
							<Badge variant={statusVariant[account.status]}>{account.status}</Badge>
						</CardHeader>

						<CardContent className="flex items-center gap-3">
							<Button
								size="sm"
								disabled={syncing || account.status !== 'ACTIVE'}
								onClick={(e) => {
									e.stopPropagation();
									requestSync.mutate(account.id);
								}}
							>
								{syncing ? 'Queueing…' : 'Sync now'}
							</Button>

							{requestSync.isSuccess &&
								requestSync.variables === account.id &&
								requestSync.data.alreadyQueued && (
									<span className="text-muted-foreground text-sm">
										already queued
									</span>
								)}
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}