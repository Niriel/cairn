<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import { devPasswordSignIn, HttpError } from '$lib/auth/model/auth-client';
	import { setSignedIn } from '$lib/shared/state/session.svelte';

	type Props = {
		sending: boolean;
		setSending: (v: boolean) => void;
		onInlineError: (message: string) => void;
		onServerError: () => void;
	};

	const { sending, setSending, onInlineError, onServerError }: Props = $props();

	const DEV_USERS = [
		{ name: 'alice', email: 'alice@example.test' },
		{ name: 'bob', email: 'bob@example.test' },
		{ name: 'carol', email: 'carol@example.test' }
	] as const;

	function isHttpError400(err: unknown): err is HttpError {
		return err instanceof HttpError && err.status >= 400 && err.status < 500;
	}

	async function onDevLogin(devEmail: string) {
		if (sending) return;
		setSending(true);
		try {
			const { user } = await devPasswordSignIn(devEmail, import.meta.env.VITE_DEV_LOGIN_PASSWORD);
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
			variant="ghost"
			disabled={sending}
			data-test={`dev-login-${user.name}`}
			onclick={() => onDevLogin(user.email)}
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
