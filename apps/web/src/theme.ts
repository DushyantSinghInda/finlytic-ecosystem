export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'finlytic.theme';

export function storedPreference(): ThemePreference {
	try {
		const value = localStorage.getItem(THEME_STORAGE_KEY);
		// 'system' is also what we fall back to for null and for anything
		// unrecognised, so a corrupt value degrades to the sane default.
		return value === 'light' || value === 'dark' ? value : 'system';
	} catch {
		// Private windows and blocked-cookie settings make localStorage throw
		// on access rather than return null.
		return 'system';
	}
}

export function persistPreference(preference: ThemePreference): void {
	try {
		localStorage.setItem(THEME_STORAGE_KEY, preference);
	} catch {
		// Not fatal: the choice still applies, it just will not survive a reload.
	}
}

export function systemTheme(): ResolvedTheme {
	return window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light';
}

export function applyTheme(theme: ResolvedTheme): void {
	// One class drives everything: the `dark` custom variant, every `dark:`
	// utility compiled into the shadcn components, and the `color-scheme`
	// swap in index.css. That last one is why CSS variables alone are not
	// enough — they cannot repaint scrollbars or native form controls.
	document.documentElement.classList.toggle('dark', theme === 'dark');
}