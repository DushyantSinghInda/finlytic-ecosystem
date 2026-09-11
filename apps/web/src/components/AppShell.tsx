import type { ReactNode } from 'react';
import { LogOut, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './ThemeToggle';

export function AppShell({
	email,
	role,
	onSignOut,
	children,
}: {
	email: string;
	role: string;
	onSignOut: () => void;
	children: ReactNode;
}) {
	return (
		<div className="bg-background min-h-svh">
			{/* Sticky + translucent, so the message list scrolls *under* the bar.
                          It needs its own background for that: without one, the rows show
                          through and the header becomes unreadable mid-scroll. */}
			<header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
				<div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-6">
					<div className="flex items-center gap-2">
						<Mail className="text-muted-foreground" aria-hidden />
						<h1 className="text-sm font-medium tracking-tight">Finlytic</h1>
					</div>

					<div className="flex items-center gap-3">
						<div className="hidden text-right sm:block">
							<p className="text-sm leading-tight font-medium">{email}</p>
							<p className="text-muted-foreground text-xs leading-tight">
								{role}
							</p>
						</div>

						<ThemeToggle />

						<Button variant="outline" size="sm" onClick={onSignOut}>
							<LogOut data-icon="inline-start" aria-hidden />
							Sign out
						</Button>
					</div>
				</div>
			</header>

			<main className="mx-auto w-full max-w-5xl px-6 py-8">{children}</main>
		</div>
	);
}