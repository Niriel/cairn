<script lang="ts">
	import type { Component } from 'svelte';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import Button from '$lib/basic/components/Button.svelte';
	import { sendMagicLink } from '$lib/auth/model/auth-client';
	import { isDevLoginShortcutEnabled } from '$lib/auth/model/dev-shortcut';
	import { setPendingLogin } from '$lib/auth/state/pending-login.svelte';
	import CairnGlyph from '$lib/shared/components/CairnGlyph.svelte';
	import Snackbar from '$lib/shared/components/Snackbar.svelte';

	const SNACKBAR_MESSAGE = "Couldn't reach the server. Try again.";

	let DevShortcuts: Component<{
		sending: boolean;
		setSending: (v: boolean) => void;
		onInlineError: (m: string) => void;
		onServerError: () => void;
	}> | null = $state(null);

	if (import.meta.env.DEV) {
		void import('./DevShortcuts.svelte').then((m) => (DevShortcuts = m.default));
	}

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

	async function onSubmit(event: Event) {
		event.preventDefault();
		if (!emailValid || sending) return;
		sending = true;
		inlineError = null;
		try {
			// Anti-enumeration: any GoTrue outcome (link sent, banned,
			// unconfirmed, rate-limited, unknown email) renders the same
			// post-submit screen. See docs/admin.md → "What the web app
			// shows when a banned user tries to sign in."
			await sendMagicLink(email).catch(() => {});
			setPendingLogin(email);
			await goto(resolve('/auth/check')).catch(() => {});
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
		<label class="label" for="login-email-input">E-mail</label>
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
				variant="rect"
				tone="primary"
				disabled={!emailValid || sending}
				data-test="login-submit"
			>
				Send me a magic link
			</Button>
		</div>

		<div class="hint">
			No password. We'll e-mail you a link to continue.<br />
			Your data lives on a small server in Germany.
		</div>

		{#if DevShortcuts && devShortcutEnabled}
			<DevShortcuts
				{sending}
				setSending={(v) => (sending = v)}
				onInlineError={(m) => (inlineError = m)}
				onServerError={() => (errorSnack = true)}
			/>
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
		background: var(--paper-alt);
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
</style>
