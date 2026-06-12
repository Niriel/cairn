<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import LoginCheck from '$lib/auth/components/LoginCheck.svelte';
	import { pendingLogin } from '$lib/auth/state/pending-login.svelte';
	import { session } from '$lib/shared/state/session.svelte';

	// The email lives in the store only — never read from the URL. A direct
	// visit without the store populated falls back to /auth/login.
	//
	// The `signed-in` guard avoids a redirect race: a successful code entry calls
	// setSignedIn, which fires pending-login's auto-clear effect (nulling
	// pendingLogin.email). Without this guard, that null would bounce the
	// just-signed-in user here to /auth/login, competing with LoginCheck's own
	// goto('/').
	$effect(() => {
		if (pendingLogin.email === null && session.current.status !== 'signed-in') {
			void goto(resolve('/auth/login'), { replaceState: true });
		}
	});
</script>

{#if pendingLogin.email !== null}
	<LoginCheck email={pendingLogin.email} />
{/if}
