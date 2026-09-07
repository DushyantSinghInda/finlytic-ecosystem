import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { PublicUser } from '@finlytic/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { login, logout, refreshSession } from '@/api/client';
import { AuthContext } from './auth-context';

// A state machine, not three booleans: 'loading' and 'anonymous' are different
// states and rendering them the same way is how you get a login form flashing
// on every reload.
type AuthState =
	| { status: 'loading' }
	| { status: 'anonymous' }
	| { status: 'authenticated'; user: PublicUser };


export function AuthProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<AuthState>({ status: 'loading' });
	const queryClient = useQueryClient();

	useEffect(() => {
		// The access token died with the last page load. The refresh cookie is
		// the only thing that knows whether a session survives.
		void refreshSession().then((session) => {
			setState(
				session
					? { status: 'authenticated', user: session.user }
					: { status: 'anonymous' },
			);
		});
	}, []);

	const signIn = useCallback(async (email: string, password: string) => {
		const session = await login(email, password);
		setState({ status: 'authenticated', user: session.user });
	}, []);

	const signOut = useCallback(async () => {
		await logout();
		// Without this the next person to use this tab sees the previous one's
		// cached accounts until the cache goes stale.
		queryClient.clear();
		setState({ status: 'anonymous' });
	}, [queryClient]);

	const value = useMemo(
		() => ({ state, signIn, signOut }),
		[state, signIn, signOut],
	);

	return <AuthContext value={value}>{children}</AuthContext>;
}