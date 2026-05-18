<script lang="ts">
	import { goto } from '$app/navigation';

	import Button from '$lib/basic/components/Button.svelte';
	import { devPasswordSignIn, HttpError, sendMagicLink } from '$lib/auth/model/auth-client';
	import { isDevLoginShortcutEnabled } from '$lib/auth/model/dev-shortcut';
	import { setPendingLogin } from '$lib/auth/state/pending-login.svelte';
	import CairnGlyph from '$lib/shared/components/CairnGlyph.svelte';
	import Snackbar from '$lib/shared/components/Snackbar.svelte';
	import { setSignedIn } from '$lib/shared/state/session.svelte';

	const SNACKBAR_MESSAGE = "Couldn't reach the server. Try again.";
	const DEV_USERS = [
		{ name: 'alice', email: 'alice@example.test' },
		{ name: 'bob', email: 'bob@example.test' },
		{ name: 'carol', email: 'carol@example.test' }
	] as const;

	const devShortcutEnabled = isDevLoginShortcutEnabled();

	let email = $state('');
	let emailValid = $state(false);
	let sending = $state(false);
	let inlineError = $state<string | null>(null);
	let errorSnack = $state(false);

	function onEmailInput(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		email = target.value;
		emailValid = target.validity.valid && target.value.length > 0;
	}

	function isHttpError400(err: unknown): err is HttpError {
		return err instanceof HttpError && err.status >= 400 && err.status < 500;
	}

	async function onSubmit(event: Event) {
		event.preventDefault();
		if (!emailValid || sending) return;
		sending = true;
		inlineError = null;
		try {
			await sendMagicLink(email);
			setPendingLogin(email);
			// /auth/check route is created in task 3.5 — until then
			// `resolve()` types reject the path. Swap back to
			// `goto(resolve('/auth/check'))` once that task lands.
			// See docs/quality.md "Navigating to a not-yet-created SvelteKit route".
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto('/auth/check');
		} catch (err) {
			if (isHttpError400(err)) {
				inlineError = err.message || 'Please check the email and try again.';
			} else {
				errorSnack = true;
			}
		} finally {
			sending = false;
		}
	}

	async function onDevLogin(devEmail: string) {
		if (sending) return;
		sending = true;
		try {
			const { user } = await devPasswordSignIn(devEmail, import.meta.env.VITE_DEV_LOGIN_PASSWORD);
			setSignedIn(user);
		} catch {
			errorSnack = true;
		} finally {
			sending = false;
		}
	}
</script>

<div class="screen">
	<div class="glyph">
		<CairnGlyph size={56} color="var(--accent)" />
	</div>
	<div class="wordmark">Cairn</div>
	<div class="tagline">here's the way,<br />you'll like this</div>

	<form class="form" onsubmit={onSubmit}>
		<label class="label" for="login-email-input">Email</label>
		<input
			id="login-email-input"
			class="email-input"
			type="email"
			required
			autocomplete="email"
			inputmode="email"
			data-test="login-email"
			value={email}
			oninput={onEmailInput}
		/>

		{#if inlineError}
			<div class="inline-error" data-test="login-error">{inlineError}</div>
		{/if}

		<div class="submit-row">
			<Button
				type="submit"
				variant="primary"
				disabled={!emailValid || sending}
				data-test="login-submit"
			>
				Send me a magic link
			</Button>
		</div>

		<div class="hint">
			No password. We'll email you a link that signs you in.<br />
			Your data lives on a small server in Germany.
		</div>

		{#if devShortcutEnabled}
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
		{/if}
	</form>
</div>

<Snackbar
	open={errorSnack}
	message={SNACKBAR_MESSAGE}
	onclose={() => (errorSnack = false)}
	data-test="login-snackbar"
/>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		padding: 60px 28px 40px;
	}

	.glyph {
		display: flex;
		justify-content: center;
		margin-bottom: 28px;
	}

	.wordmark {
		font-family: 'Newsreader', Georgia, serif;
		font-size: 36px;
		font-weight: 500;
		letter-spacing: -0.02em;
		color: var(--ink);
		text-align: center;
		line-height: 1.05;
	}

	.tagline {
		text-align: center;
		margin-top: 10px;
		color: var(--stone);
		font-size: 14px;
		line-height: 1.5;
		font-style: italic;
		font-family: 'Newsreader', Georgia, serif;
	}

	.form {
		margin-top: 56px;
		display: flex;
		flex-direction: column;
	}

	.label {
		font-size: 13px;
		color: var(--stone);
		font-weight: 500;
	}

	.email-input {
		margin-top: 8px;
		padding: 14px;
		border: 1px solid var(--rule);
		border-radius: 12px;
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		font-size: 16px;
	}

	.inline-error {
		margin-top: 8px;
		color: var(--ember, #b00020);
		font-size: 13px;
	}

	.submit-row {
		margin-top: 16px;
		display: flex;
	}

	.submit-row :global(button) {
		flex: 1;
		padding: 14px;
		border-radius: 12px;
		font-size: 15px;
		font-weight: 600;
	}

	.hint {
		margin-top: 18px;
		font-size: 12px;
		color: var(--stone);
		text-align: center;
		line-height: 1.5;
	}

	.dev-shortcuts {
		margin-top: 24px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
</style>
