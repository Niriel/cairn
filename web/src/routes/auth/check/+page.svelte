<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import LoginCheck from '$lib/auth/components/LoginCheck.svelte';
	import { pendingLogin } from '$lib/auth/state/pending-login.svelte';

	// R14: the email lives in the store only — never read from the URL.
	// A direct visit without the store populated falls back to /auth/login.
	$effect(() => {
		if (pendingLogin.email === null) {
			void goto(resolve('/auth/login'), { replaceState: true });
		}
	});
</script>

{#if pendingLogin.email !== null}
	<LoginCheck email={pendingLogin.email} />
{/if}
