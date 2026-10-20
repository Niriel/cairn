<script lang="ts">
	import { HttpError, confirmRecoveryEmail } from '$lib/auth/model/auth-client';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';

	type Props = { email: string; onConfirmed: () => void };
	let { email, onConfirmed }: Props = $props();

	const CODE_INVALID_MESSAGE = 'That code is incorrect or expired.';
	const SERVER_ERROR_MESSAGE = "Couldn't reach the server. Try again.";

	let code = $state('');
	let verifying = $state(false);
	let error = $state<string | null>(null);

	const codeValid = $derived(/^\d{6}$/.test(code));

	function onCodeInput(event: Event) {
		code = (event.currentTarget as HTMLInputElement).value;
		error = null;
	}

	async function submit() {
		if (!codeValid || verifying) return;
		verifying = true;
		error = null;
		try {
			await confirmRecoveryEmail(code);
			onConfirmed();
		} catch (err) {
			// A 4xx is a wrong/expired/locked code — the user can retry inline.
			// Anything else is a transient failure; surface it the same way.
			error =
				err instanceof HttpError && err.status >= 400 && err.status < 500
					? CODE_INVALID_MESSAGE
					: SERVER_ERROR_MESSAGE;
		} finally {
			verifying = false;
		}
	}
</script>

<div class="verify">
	<div class="icon-disc">
		<Icon name="mail-check" size={28} />
	</div>

	<h3 class="heading">Check your inbox</h3>

	<p class="body">
		We sent a six-digit code to
		<strong data-test="recovery-email-verify-address">{email}</strong>. Enter it below to confirm
		this address.
	</p>

	<div class="code-field">
		<TextInput
			value={code}
			inputmode="numeric"
			autocomplete="one-time-code"
			maxlength={6}
			placeholder="000000"
			data-test="recovery-email-code"
			autofocus
			oninput={onCodeInput}
		/>
		{#if error}
			<div class="inline-error" data-test="recovery-email-code-error">{error}</div>
		{/if}
		<Button
			variant="rect"
			tone="primary"
			type="button"
			disabled={!codeValid || verifying}
			data-test="recovery-email-verify"
			onclick={submit}
		>
			Verify and save
		</Button>
	</div>
</div>

<style>
	.verify {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 1.25rem 1.125rem 0.5rem;
	}

	.icon-disc {
		width: 56px;
		height: 56px;
		border-radius: 99px;
		background: var(--sage-bg, color-mix(in srgb, var(--sage) 18%, transparent));
		color: var(--sage);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1rem;
	}

	.heading {
		font-family: 'Newsreader', Georgia, serif;
		font-weight: 500;
		color: var(--ink);
		margin: 0;
	}

	.body {
		margin-top: 0.5rem;
		color: var(--stone);
		line-height: 1.5;
		max-width: 280px;
	}

	.body strong {
		color: var(--ink);
		font-weight: 600;
	}

	.code-field {
		margin-top: 1.25rem;
		width: 100%;
		max-width: 280px;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* Mirror the global .mono role (typography.css) — the field isn't a place we
	   can drop a class on, so the font-family is repeated here, not a new value. */
	.code-field :global(input) {
		text-align: center;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		letter-spacing: 0.3em;
	}

	.inline-error {
		color: var(--ember);
		font-size: 0.8rem;
		text-align: left;
	}
</style>
