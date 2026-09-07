import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MailAccountSummary, SyncRequestResult } from '@finlytic/shared-types';
import { apiJson } from '@/api/client';

export function useAccounts() {
	return useQuery({
		queryKey: ['accounts'],
		// Query hands in an AbortSignal and cancels on unmount or refetch — one
		// of the reasons to keep fetch rather than adapt a library to it.
		queryFn: ({ signal }) =>
			apiJson<MailAccountSummary[]>('/accounts', { signal }),
	});
}

export function useRequestSync() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (accountId: string) =>
			apiJson<SyncRequestResult>(`/accounts/${accountId}/sync`, {
				method: 'POST',
			}),
		onSuccess: () => {
			// 202 means queued, not done — the worker updates lastSyncedAt some
			// seconds later. Refetch now for the status, then once more to catch
			// the result. A heuristic: the honest fix is the server telling us.
			void queryClient.invalidateQueries({ queryKey: ['accounts'] });
			setTimeout(() => {
				void queryClient.invalidateQueries({ queryKey: ['accounts'] });
			}, 2500);
		},
	});
}