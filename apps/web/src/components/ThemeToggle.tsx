import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
	applyTheme,
	persistPreference,
	storedPreference,
	systemTheme,
	type ResolvedTheme,
	type ThemePreference,
} from '@/theme';

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
	{ value: 'light', label: 'Light', Icon: Sun },
	{ value: 'dark', label: 'Dark', Icon: Moon },
	{ value: 'system', label: 'System', Icon: Monitor },
];

export function ThemeToggle() {
	const [preference, setPreference] = useState<ThemePreference>(storedPreference);
	const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

	// Subscribed unconditionally — NOT only while preference === 'system'.
	// The icon is derived from this value, so it has to stay current even
	// while an explicit light/dark choice is active. Scope the listener to
	// the 'system' branch and switching back to System shows a stale icon
	// until the OS next changes.
	useEffect(() => {
		const query = window.matchMedia('(prefers-color-scheme: dark)');
		const onChange = () => setSystem(query.matches ? 'dark' : 'light');

		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	}, []);

	const resolved: ResolvedTheme = preference === 'system' ? system : preference;

	// The <head> script owns the first paint; this keeps the DOM in step with
	// every change after it.
	useEffect(() => {
		applyTheme(resolved);
	}, [resolved]);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`Theme: ${preference}`}
					/>
				}
			>
				{/* Shows the current theme, not the action. A menu offers three
                                  choices, so an "opposite of now" icon would be a lie. */}
				{resolved === 'dark' ? <Moon aria-hidden /> : <Sun aria-hidden />}
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup
					value={preference}
					onValueChange={(value) => {
						const next = value as ThemePreference;
						setPreference(next);
						persistPreference(next);
					}}
				>
					{OPTIONS.map(({ value, label, Icon }) => (
						<DropdownMenuRadioItem key={value} value={value}>
							<Icon aria-hidden />
							{label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}