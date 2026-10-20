<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import Button from '$lib/basic/components/Button.svelte';
	import Label from '$lib/basic/components/Label.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';
	import AuthLegalFooter from '$lib/auth/components/AuthLegalFooter.svelte';
	import { HttpError, signIn } from '$lib/auth/model/auth-client';
	import CairnGlyph from '$lib/shared/components/CairnGlyph.svelte';
	import Snackbar from '$lib/shared/components/Snackbar.svelte';
	import { setSignedIn } from '$lib/shared/state/session.svelte';

	// Constant-shape failure: never reveal whether the username or the password
	// was wrong — the BFF returns one 401 for both, and the copy mirrors that.
	const INVALID_MESSAGE = 'That username or password is incorrect.';
	const SNACKBAR_MESSAGE = "Couldn't reach the server. Try again.";

	let username = $state('');
	let password = $state('');
	let sending = $state(false);
	let inlineError = $state<string | null>(null);
	let errorSnack = $state(false);

	const canSubmit = $derived(username.length > 0 && password.length > 0);

	function isHttpError(err: unknown): err is HttpError {
		return err instanceof HttpError;
	}

	async function onSubmit(event: Event) {
		event.preventDefault();
		if (!canSubmit || sending) return;
		sending = true;
		inlineError = null;
		try {
			const { user } = await signIn(username, password);
			setSignedIn(user);
			await goto(resolve('/'));
		} catch (err) {
			// A 4xx is an authoritative credential verdict → the constant-shape
			// inline message. Anything else (503, network) is a transient blip.
			if (isHttpError(err) && err.status >= 400 && err.status < 500) {
				inlineError = INVALID_MESSAGE;
			} else {
				errorSnack = true;
			}
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

	<p class="blurb">Sign in to pick up your lists where you left off.</p>

	<form class="form" onsubmit={onSubmit}>
		<div class="field">
			<Label for="signin-username-input">Username</Label>
			<TextInput
				type="text"
				id="signin-username-input"
				bind:value={username}
				required
				autocomplete="username"
				data-test="signin-username"
			/>
		</div>

		<div class="field">
			<Label for="signin-password-input">Password</Label>
			<TextInput
				type="password"
				id="signin-password-input"
				bind:value={password}
				required
				autocomplete="current-password"
				data-test="signin-password"
			/>
		</div>

		{#if inlineError}
			<div class="inline-error" data-test="signin-error">{inlineError}</div>
		{/if}

		<p class="forgot">
			<a href={resolve('/auth/forgot-password')} data-test="signin-forgot-link">Forgot password?</a>
		</p>

		<div class="submit-row">
			<Button
				type="submit"
				variant="rect"
				tone="primary"
				disabled={!canSubmit || sending}
				data-test="signin-submit"
				style="flex: 1"
			>
				Sign in
			</Button>
		</div>

		<p class="crosslink">
			New to Cairn?
			<a href={resolve('/auth/register')} data-test="signin-register-link">Create an account</a>
		</p>
	</form>

	<AuthLegalFooter hookPrefix="signin" />
</div>

<Snackbar
	open={errorSnack}
	message={SNACKBAR_MESSAGE}
	onclose={() => (errorSnack = false)}
	data-test="signin-snackbar"
/>

<style>
	/* Deltas on the global .screen primitive (layout.css); just the tall inset. */
	.screen {
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

	.blurb {
		margin-top: 28px;
		padding: 0px 2rem;
		text-align: center;
		color: var(--stone);
		line-height: 1.6;
	}

	.form {
		margin-top: 40px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.inline-error {
		color: var(--ember, #b00020);
		font-size: 13px;
	}

	.submit-row {
		display: flex;
	}

	.forgot {
		text-align: right;
		font-size: 13px;
		margin-top: -4px;
	}

	.forgot a {
		color: var(--accent);
		text-decoration: none;
	}

	.crosslink {
		text-align: center;
		color: var(--stone);
		font-size: 14px;
	}

	.crosslink a {
		color: var(--accent);
		text-decoration: none;
	}
</style>
