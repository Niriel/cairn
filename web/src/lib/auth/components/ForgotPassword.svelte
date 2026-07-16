<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import Button from '$lib/basic/components/Button.svelte';
	import Label from '$lib/basic/components/Label.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';
	import { requestPasswordReset } from '$lib/auth/model/auth-client';
	import { setPendingReset } from '$lib/auth/state/pending-reset.svelte';
	import CairnGlyph from '$lib/shared/components/CairnGlyph.svelte';

	let username = $state('');
	let sending = $state(false);

	const canSubmit = $derived(username.length > 0);

	async function onSubmit(event: Event) {
		event.preventDefault();
		if (!canSubmit || sending) return;
		sending = true;
		try {
			// Anti-enumeration: any outcome (code sent, unknown username, no
			// recovery e-mail on file, rate-limited, server error) renders the
			// same next screen. The BFF already answers a constant 200; swallowing
			// here keeps the public path from leaking through a thrown error.
			await requestPasswordReset(username).catch(() => {});
			setPendingReset(username);
			await goto(resolve('/auth/reset-password')).catch(() => {});
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
	<h1 class="heading">Forgot your password?</h1>

	<p class="blurb">
		Enter your username and we'll e-mail a reset code to your recovery e-mail, if you have one on
		file.
	</p>

	<form class="form" onsubmit={onSubmit}>
		<div class="field">
			<Label for="forgot-username-input">Username</Label>
			<TextInput
				type="text"
				id="forgot-username-input"
				bind:value={username}
				required
				autocomplete="username"
				data-test="forgot-username"
			/>
		</div>

		<div class="submit-row">
			<Button
				type="submit"
				variant="rect"
				tone="primary"
				disabled={!canSubmit || sending}
				data-test="forgot-submit"
				style="flex: 1"
			>
				Send reset code
			</Button>
		</div>

		<p class="crosslink">
			Remembered it?
			<a href={resolve('/auth/signin')} data-test="forgot-signin-link">Back to sign in</a>
		</p>
	</form>
</div>

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

	.heading {
		font-family: 'Newsreader', Georgia, serif;
		font-size: 22px;
		font-weight: 500;
		color: var(--ink);
		text-align: center;
		margin: 14px 0 0;
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
</style>
