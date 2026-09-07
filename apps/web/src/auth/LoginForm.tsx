import { useState } from 'react';
import { useAuth } from './auth-context';

export function LoginForm() {
	const { signIn } = useAuth();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	return (
		<form
			className="mx-auto mt-24 flex w-80 flex-col gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				setError(null);
				setPending(true);

				signIn(email, password)
					.catch(() => setError('Invalid email or password'))
					.finally(() => setPending(false));
			}}
		>
			<h1 className="text-xl font-semibold">Sign in</h1>

			<input
				className="rounded border px-3 py-2"
				type="email"
				value={email}
				required
				onChange={(event) => setEmail(event.target.value)}
				placeholder="you@example.com"
			/>
			<input
				className="rounded border px-3 py-2"
				type="password"
				value={password}
				required
				onChange={(event) => setPassword(event.target.value)}
				placeholder="password"
			/>

			<button
				className="rounded bg-emerald-600 px-3 py-2 text-white disabled:opacity-50"
				type="submit"
				disabled={pending}
			>
				{pending ? 'Signing in…' : 'Sign in'}
			</button>

			{/* One message for every failure — the API deliberately does not say
                          whether the email exists, and neither should this. */}
			{error && <p className="text-sm text-red-600">{error}</p>}
		</form>
	);
}