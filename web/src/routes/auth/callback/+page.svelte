<script lang="ts">
	import { onMount } from 'svelte';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	import { verifyToken } from '$lib/auth/model/auth-client';
	import { bootSession, session, setSignedIn } from '$lib/shared/state/session.svelte';

	type Status = 'loading' | 'error';
	let status = $state<Status>('loading');

	onMount(async () => {
		// Wait for the session to resolve before reading status. The layout
		// fires bootSession() asynchronously, and this onMount typically
		// runs while status is still 'unknown' — without awaiting boot we
		// would miss an already-signed-in user clicking a stale magic link
		// and fall through to verifyToken with a dead token.
		await bootSession();
		if (session.current.status === 'signed-in') {
			await goto(resolve('/'), { replaceState: true });
			return;
		}

		const token = page.url.searchParams.get('token');
		const type = page.url.searchParams.get('type');
		// Runtime narrowing for verifyToken's `type: 'magiclink'` literal —
		// URLSearchParams returns free-form strings.
		if (!token || type !== 'magiclink') {
			status = 'error';
			return;
		}

		try {
			const { user } = await verifyToken({ token, type });
			setSignedIn(user);
			await goto(resolve('/'), { replaceState: true });
		} catch {
			status = 'error';
		}
	});
</script>

{#if status === 'loading'}
	<div class="screen" data-test="callback-loading">Verifying…</div>
{:else}
	<div class="screen">
		<p>Sign-in didn't complete. The link may have expired.</p>
		<a href={resolve('/auth/login')} data-test="callback-error-back">Back to sign in</a>
	</div>
{/if}

<style>
	.screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 80px 28px 40px;
		text-align: center;
		color: var(--ink);
	}
</style>
