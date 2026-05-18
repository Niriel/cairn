export function isDevLoginShortcutEnabled(): boolean {
	if (!import.meta.env.DEV) return false;
	return import.meta.env.VITE_DEV_LOGIN_SHORTCUT === 'true';
}
