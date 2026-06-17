<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import { signIn, HttpError } from '$lib/auth/model/auth-client';
	import { setSignedIn } from '$lib/shared/state/session.svelte';

	type Props = {
		sending: boolean;
		setSending: (v: boolean) => void;
		onInlineError: (message: string) => void;
		onServerError: () => void;
	};

	const { sending, setSending, onInlineError, onServerError }: Props = $props();

	// The dev-login shortcut now goes through the real /auth/signin path
	// (the public password grant is locked to the BFF, see the R6 lockdown).
	// The seed gives these accounts the matching fixed usernames.
	const DEV_USERS = [
		{ name: 'alice', username: 'alice' },
		{ name: 'bob', username: 'bob' },
		{ name: 'carol', username: 'carol' }
	] as const;

	function isHttpError400(err: unknown): err is HttpError {
		return err instanceof HttpError && err.status >= 400 && err.status < 500;
	}

	async function onDevLogin(username: string) {
		if (sending) return;
		setSending(true);
		try {
			const { user } = await signIn(username, import.meta.env.VITE_DEV_LOGIN_PASSWORD);
			setSignedIn(user);
		} catch (err) {
			if (isHttpError400(err)) {
				onInlineError(err.message || 'Sign-in failed. Check the dev password and try again.');
			} else {
				onServerError();
			}
		} finally {
			setSending(false);
		}
	}
</script>

<div class="dev-shortcuts">
	{#each DEV_USERS as user (user.name)}
		<Button
			variant="text"
			tone="ink"
			disabled={sending}
			data-test={`dev-login-${user.name}`}
			onclick={() => onDevLogin(user.username)}
		>
			Sign in as {user.name}
		</Button>
	{/each}
</div>

<style>
	.dev-shortcuts {
		margin-top: 24px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
</style>
