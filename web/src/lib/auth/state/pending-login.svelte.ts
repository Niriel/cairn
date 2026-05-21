import { session } from '$lib/shared/state/session.svelte';

// Module-scoped singleton: a hard reload of any page wipes it, which is
// R14's "feature, not a regression" — the email is only meaningful
// within the same-tab magic-link flow that wrote it.
const _pending = $state<{ email: string | null }>({ email: null });

export const pendingLogin: { email: string | null } = _pending;

export function setPendingLogin(email: string): void {
	_pending.email = email;
}

export function clearPendingLogin(): void {
	_pending.email = null;
}

// Auto-clear on `signed-in` (R14): once sign-in resolves, the email's
// purpose has been served, and a same-tab direct-visit to `/auth/check`
// should fall back to `/auth/login`. The effect deliberately does NOT
// clear on `signed-out` — a boot-driven 401 happens during the magic-
// link flow itself (the user typed an email and is now on
// `/auth/check`), so clearing then would wipe a flow-in-progress.
$effect.root(() => {
	$effect(() => {
		if (session.current.status === 'signed-in') {
			_pending.email = null;
		}
	});
});
