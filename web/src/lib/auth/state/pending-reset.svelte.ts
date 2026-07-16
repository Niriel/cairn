// Module-scoped singleton carrying the username from /auth/forgot-password to
// /auth/reset-password within the same tab. A hard reload (or opening the
// emailed code on another device) wipes it, which
// is fine — the reset screen always shows an editable username field and
// reset_password takes the username as a parameter, so the store is a
// convenience prefill, never load-bearing.
const _pending = $state<{ username: string | null }>({ username: null });

export const pendingReset: { username: string | null } = _pending;

export function setPendingReset(username: string): void {
	_pending.username = username;
}

export function clearPendingReset(): void {
	_pending.username = null;
}
