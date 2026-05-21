<script lang="ts">
	import { onMount } from 'svelte';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import { exchangeRefreshToken } from '$lib/auth/model/auth-client';
	import { bootSession, session, setSignedIn } from '$lib/shared/state/session.svelte';

	type Status = 'loading' | 'error';
	let status = $state<Status>('loading');

	onMount(async () => {
		// Capture hash + immediately strip from URL — minimize the JS-visible
		// window for the access/refresh tokens that GoTrue planted there.
		const rawHash = window.location.hash;
		if (rawHash) {
			history.replaceState({}, '', window.location.pathname + window.location.search);
		}

		// Wait for the session to resolve before reading status. The layout
		// fires bootSession() asynchronously, and this onMount typically
		// runs while status is still 'unknown' — without awaiting boot we
		// would miss an already-signed-in user clicking a stale magic link
		// and fall through to exchangeRefreshToken with a dead token.
		await bootSession();
		if (session.current.status === 'signed-in') {
			await goto(resolve('/'), { replaceState: true });
			return;
		}

		if (!rawHash) {
			status = 'error';
			return;
		}
		const params = new URLSearchParams(rawHash.replace(/^#/, ''));
		if (params.get('error')) {
			status = 'error';
			return;
		}
		const refreshToken = params.get('refresh_token');
		const type = params.get('type');
		if (!refreshToken || type !== 'magiclink') {
			status = 'error';
			return;
		}

		try {
			const { user } = await exchangeRefreshToken(refreshToken);
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
