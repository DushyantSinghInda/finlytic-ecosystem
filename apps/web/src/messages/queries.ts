import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { MessageDetail, MessagePage } from '@finlytic/shared-types';
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

export function useMessage(accountId: string | null, messageId: string | null) {
	return useQuery({
		queryKey: ['message', accountId, messageId],
		enabled: accountId !== null && messageId !== null,
		// A message never changes once ingested, so it is cached for the session.
		staleTime: Infinity,
		queryFn: ({ signal }) => {
			if (!accountId || !messageId) {
				throw new Error('nothing selected');
			}

			return apiJson<MessageDetail>(
				`/api/accounts/${accountId}/messages/${messageId}`,
				{ signal },
			);
		},
	});
}