<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import Button from '$lib/basic/components/Button.svelte';
	import Label from '$lib/basic/components/Label.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';
	import { HttpError, resetPassword } from '$lib/auth/model/auth-client';
	import { pendingReset } from '$lib/auth/state/pending-reset.svelte';
	import Snackbar from '$lib/shared/components/Snackbar.svelte';

	const CODE_INVALID_MESSAGE = 'That code is incorrect or expired, or the password is too short.';
	const SNACKBAR_MESSAGE = "Couldn't reach the server. Try again.";

	// Prefill from the same-tab store when present, but the field is always shown
	// and editable: the reset code arrives by e-mail and is often opened on a
	// different device/tab (or after a reload that wipes the store), so the
	// screen must not depend on a pending username. reset_password takes it as a
	// parameter regardless.
	let username = $state(pendingReset.username ?? '');
	let code = $state('');
	let password = $state('');
	let sending = $state(false);
	let inlineError = $state<string | null>(null);
	let errorSnack = $state(false);

	const canSubmit = $derived(username.length > 0 && /^\d{6}$/.test(code) && password.length > 0);

	async function onSubmit(event: Event) {
		event.preventDefault();
		if (sending) return;
		// No username at all (none pending, none typed): we can't reset. Bounce
		// back to the request screen rather than calling the RPC with a blank.
		if (username.length === 0) {
			await goto(resolve('/auth/forgot-password')).catch(() => {});
			return;
		}
		if (!canSubmit) return;
		sending = true;
		inlineError = null;
		try {
			await resetPassword(username, code, password);
			// No auto-login — the user signs in with the new password.
			await goto(resolve('/auth/signin'));
		} catch (err) {
			// A 4xx is an authoritative verdict (wrong/expired/locked code, or a
			// too-short password) → inline. Anything else is transient → snackbar.
			if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
				inlineError = CODE_INVALID_MESSAGE;
			} else {
				errorSnack = true;
			}
		} finally {
			sending = false;
		}
	}
</script>

<div class="screen">
	<h1 class="heading">Set a new password</h1>

	<p class="blurb">Enter the code we e-mailed you, along with your username and a new password.</p>

	<form class="form" onsubmit={onSubmit}>
		<div class="field">
			<Label for="reset-username-input">Username</Label>
			<!-- No `required`: submission is gated in JS (canSubmit + the explicit
			     empty-username check that bounces to /auth/forgot-password), and
			     native constraint validation would otherwise block that submit and
			     leave the fallback unreachable. -->
			<TextInput
				type="text"
				id="reset-username-input"
				bind:value={username}
				autocomplete="username"
				data-test="reset-username"
			/>
		</div>

		<div class="field">
			<Label for="reset-code-input">Reset code</Label>
			<TextInput
				id="reset-code-input"
				bind:value={code}
				inputmode="numeric"
				autocomplete="one-time-code"
				maxlength={6}
				placeholder="000000"
				data-test="reset-code"
			/>
		</div>

		<div class="field">
			<Label for="reset-password-input">New password</Label>
			<TextInput
				type="password"
				id="reset-password-input"
				bind:value={password}
				autocomplete="new-password"
				data-test="reset-password-input"
			/>
		</div>

		{#if inlineError}
			<div class="inline-error" data-test="reset-error">{inlineError}</div>
		{/if}

		<div class="submit-row">
			<Button
				type="submit"
				variant="rect"
				tone="primary"
				disabled={(username.length > 0 && !canSubmit) || sending}
				data-test="reset-submit"
				style="flex: 1"
			>
				Reset password
			</Button>
		</div>
	</form>
</div>

<Snackbar
	open={errorSnack}
	message={SNACKBAR_MESSAGE}
	onclose={() => (errorSnack = false)}
	data-test="reset-snackbar"
/>

<style>
	/* Deltas on the global .screen primitive (layout.css); just the tall inset. */
	.screen {
		padding: 60px 28px 40px;
	}

	.heading {
		font-family: 'Newsreader', Georgia, serif;
		font-size: 28px;
		font-weight: 500;
		color: var(--ink);
		text-align: center;
		margin: 0;
	}

	.blurb {
		margin-top: 14px;
		padding: 0 2rem;
		text-align: center;
		color: var(--stone);
		line-height: 1.6;
	}

	.form {
		margin-top: 36px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	/* Mirror the global .mono role (typography.css) — TextInput takes no class
	   prop, so the code field's monospace family is repeated here, not a new
	   value. */
	.form :global(#reset-code-input) {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		letter-spacing: 0.2em;
	}

	.inline-error {
		color: var(--ember);
		font-size: 13px;
	}

	.submit-row {
		display: flex;
	}
</style>
