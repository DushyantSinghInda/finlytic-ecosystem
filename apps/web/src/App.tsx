import { Button } from '@/components/ui/button';
import { AccountsPanel } from '@/accounts/AccountsPanel';
import { LoginForm } from '@/auth/LoginForm';
import { useAuth } from './auth/auth-context';

export default function App() {
  const { state, signOut } = useAuth();

  if (state.status === 'loading') {
    return <p className="text-muted-foreground p-8">Restoring session…</p>;
  }

  if (state.status === 'anonymous') {
    return <LoginForm />;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{state.user.email}</h1>
          <p className="text-muted-foreground text-sm">
            {state.user.role} · joined{' '}
            {new Date(state.user.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void signOut()}>
          Sign out
        </Button>
      </header>

      <AccountsPanel />
    </main>
  );
}