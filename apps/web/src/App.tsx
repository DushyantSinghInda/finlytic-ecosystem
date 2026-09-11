import { AccountsPanel } from '@/accounts/AccountsPanel';
import { AppShell } from '@/components/AppShell';
import { LoginForm } from '@/auth/LoginForm';
import { useAuth } from './auth/auth-context';
import { useSyncEvents } from './accounts/useSyncEvents';
import { useState } from 'react';
import { MessagesPanel } from './messages/MessagesPanel';

export default function App() {
  const { state, signOut } = useAuth();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  useSyncEvents(state.status === 'authenticated');

  if (state.status === 'loading') {
    return (
      <div className="bg-background text-muted-foreground grid min-h-svh place-items-center text-sm">
        Restoring session…
      </div>
    );
  }

  if (state.status === 'anonymous') {
    return <LoginForm />;
  }

  return (
    <AppShell
      email={state.user.email}
      role={state.user.role}
      onSignOut={() => void signOut()}
    >
      <div className="grid gap-8 lg:grid-cols-[280px_1fr] lg:items-start">
        {/* Sticky at lg and up: the message list is the thing that scrolls,
                                  and the mailbox you picked should stay on screen while it does.
                                  top-20 clears the 56px header plus the content's py-8. */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-20">
          <div>
            <h2 className="text-sm font-medium tracking-tight">Mailboxes</h2>
            <p className="text-muted-foreground text-xs">
              Select one to read its messages.
            </p>
          </div>

          <AccountsPanel
            selectedId={selectedAccountId}
            onSelect={setSelectedAccountId}
          />
        </aside>

        <section className="flex min-w-0 flex-col gap-3">
          <div>
            <h2 className="text-sm font-medium tracking-tight">Messages</h2>
            <p className="text-muted-foreground text-xs">
              Newest first, paginated by cursor.
            </p>
          </div>

          <MessagesPanel
            key={selectedAccountId}
            accountId={selectedAccountId}
          />
        </section>
      </div>
    </AppShell>
  );
}