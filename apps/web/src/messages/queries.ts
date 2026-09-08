import { useInfiniteQuery } from '@tanstack/react-query';
import type { MessagePage } from '@finlytic/shared-types';
import { apiJson } from '@/api/client';

export function useMessages(accountId: string | null) {
	return useInfiniteQuery({
		queryKey: ['messages', accountId],
		enabled: accountId !== null,
		initialPageParam: null as string | null,
		queryFn: ({ pageParam, signal }) => {
			if (!accountId) {
				throw new Error('no account selected');
			}

			const params = new URLSearchParams({ limit: '25' });

			if (pageParam) {
				params.set('cursor', pageParam);
			}

			return apiJson<MessagePage>(
				`/api/accounts/${accountId}/messages?${params.toString()}`,
				{ signal },
			);
		},
		// The server decides where the next page starts; the client never counts.
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}