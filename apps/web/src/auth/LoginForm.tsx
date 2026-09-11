import { useState } from 'react';
import { useAuth } from './auth-context';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
	const { signIn } = useAuth();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	return (
		<div className="bg-background grid min-h-svh place-items-center px-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Sign in</CardTitle>
					<CardDescription>
						Use the account you registered with Finlytic.
					</CardDescription>
				</CardHeader>

				<CardContent>
					<form
						className="flex flex-col gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							setError(null);
							setPending(true);

							signIn(email, password)
								.catch(() => setError('Invalid email or password'))
								.finally(() => setPending(false));
						}}
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								className="h-9"
								type="email"
								value={email}
								required
								autoFocus
								autoComplete="email"
								disabled={pending}
								placeholder="you@example.com"
								onChange={(event) => setEmail(event.target.value)}
							/>
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								className="h-9"
								type="password"
								value={password}
								required
								autoComplete="current-password"
								disabled={pending}
								onChange={(event) => setPassword(event.target.value)}
							/>
						</div>

						<Button type="submit" size="lg" disabled={pending}>
							{pending ? 'Signing in…' : 'Sign in'}
						</Button>

						{/* One message for every failure — the API deliberately does not
                                                  say whether the email exists, and neither should this. Alert
                                                  ships role="alert", so it is announced when it appears without
                                                  us hand-rolling a live region. */}
						{error && (
							<Alert variant="destructive">
								<AlertTitle>{error}</AlertTitle>
							</Alert>
						)}
					</form>
				</CardContent>
			</Card>
		</div>
	);
}