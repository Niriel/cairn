<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import Button from '$lib/basic/components/Button.svelte';
	import Label from '$lib/basic/components/Label.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';
	import { HttpError, register } from '$lib/auth/model/auth-client';
	import CairnGlyph from '$lib/shared/components/CairnGlyph.svelte';
	import Snackbar from '$lib/shared/components/Snackbar.svelte';
	import { setSignedIn } from '$lib/shared/state/session.svelte';

	// Helper copy mirrors the server's rules; the server stays authoritative
	// (a 400 surfaces the format message, a 409 the taken message).
	const USERNAME_HELP = 'Letters and numbers only, 3–30 characters.';
	const PASSWORD_HELP = 'At least 8 characters.';
	const TAKEN_MESSAGE = 'That username is taken.';
	const INVALID_MESSAGE =
		'Usernames are 3–30 letters or numbers, and passwords at least 8 characters.';
	const SNACKBAR_MESSAGE = "Couldn't reach the server. Try again.";

	let username = $state('');
	let password = $state('');
	let sending = $state(false);
	let inlineError = $state<string | null>(null);
	let errorSnack = $state(false);

	const canSubmit = $derived(username.length > 0 && password.length > 0);

	async function onSubmit(event: Event) {
		event.preventDefault();
		if (!canSubmit || sending) return;
		sending = true;
		inlineError = null;
		try {
			const { user } = await register(username, password);
			setSignedIn(user);
			await goto(resolve('/'));
		} catch (err) {
			if (err instanceof HttpError && err.status === 409) {
				inlineError = TAKEN_MESSAGE;
			} else if (err instanceof HttpError && err.status === 400) {
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

	<p class="blurb">Create an account to start making ranked lists with friends.</p>

	<form class="form" onsubmit={onSubmit}>
		<div class="field">
			<Label for="register-username-input">Username</Label>
			<TextInput
				type="text"
				id="register-username-input"
				bind:value={username}
				required
				autocomplete="username"
				data-test="register-username"
			/>
			<p class="help fine">{USERNAME_HELP}</p>
		</div>

		<div class="field">
			<Label for="register-password-input">Password</Label>
			<TextInput
				type="password"
				id="register-password-input"
				bind:value={password}
				required
				autocomplete="new-password"
				data-test="register-password"
			/>
			<p class="help fine">{PASSWORD_HELP}</p>
		</div>

		{#if inlineError}
			<div class="inline-error" data-test="register-error">{inlineError}</div>
		{/if}

		<div class="submit-row">
			<Button
				type="submit"
				variant="rect"
				tone="primary"
				disabled={!canSubmit || sending}
				data-test="register-submit"
				style="flex: 1"
			>
				Create account
			</Button>
		</div>

		<p class="crosslink">
			Already have an account?
			<a href={resolve('/auth/signin')} data-test="register-signin-link">Sign in</a>
		</p>
	</form>

	<footer class="legal fine">
		<p>Wholly European, private, and law-abiding.</p>

		<a href={resolve('/imprint')} data-test="register-imprint-link">Imprint</a>
	</footer>
</div>

<Snackbar
	open={errorSnack}
	message={SNACKBAR_MESSAGE}
	onclose={() => (errorSnack = false)}
	data-test="register-snackbar"
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

	.help {
		margin-top: 6px;
		color: var(--stone);
	}

	.inline-error {
		color: var(--ember, #b00020);
		font-size: 13px;
	}

	.submit-row {
		display: flex;
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

	.legal {
		margin-top: 32px;
		text-align: center;
	}

	.legal a {
		color: var(--stone);
		text-decoration: none;
	}
</style>
