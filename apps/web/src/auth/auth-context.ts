import { createContext, use } from 'react';
import type { PublicUser } from '@finlytic/shared-types';

export type AuthState =
	| { status: 'loading' }
	| { status: 'anonymous' }
	| { status: 'authenticated'; user: PublicUser };

export interface AuthContextValue {
	state: AuthState;
	signIn: (email: string, password: string) => Promise<void>;
	signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
	const value = use(AuthContext);

	if (!value) {
		throw new Error('useAuth must be used inside AuthProvider');
	}

	return value;
}