<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import { HttpError, sendMagicLink, verifyOtp } from '$lib/auth/model/auth-client';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';
	import { setSignedIn } from '$lib/shared/state/session.svelte';
	import Snackbar from '$lib/shared/components/Snackbar.svelte';

	type Props = { email: string };
	let { email }: Props = $props();

	const SNACKBAR_MESSAGE = "Couldn't reach the server. Try again.";
	const CODE_INVALID_MESSAGE = 'That code is incorrect or expired.';

	let sending = $state(false);
	let confirmation = $state(false);
	let confirmationTimer: ReturnType<typeof setTimeout> | null = null;

	let code = $state('');
	let verifying = $state(false);
	let codeError = $state<string | null>(null);
	let errorSnack = $state(false);
	// Edge-trigger guard: auto-submit fires only when a *fresh* edit reaches six
	// digits. After a 4xx the value is still six digits but equals the last
	// submission, so it does not loop POSTs against /auth/verify.
	let lastSubmittedCode: string | null = null;

	const codeValid = $derived(/^\d{6}$/.test(code));

	function onSendAgain() {
		if (sending) return;
		sending = true;
		void (async () => {
			try {
				// Anti-enumeration: show the same confirmation regardless
				// of GoTrue's response. See docs/admin.md → "Don't add a
				// 'resend' button that distinguishes failure modes."
				await sendMagicLink(email).catch(() => {});
				confirmation = true;
				if (confirmationTimer !== null) clearTimeout(confirmationTimer);
				confirmationTimer = setTimeout(() => {
					confirmation = false;
					confirmationTimer = null;
				}, 3000);
			} finally {
				sending = false;
			}
		})();
	}

	function isHttpError400(err: unknown): err is HttpError {
		return err instanceof HttpError && err.status >= 400 && err.status < 500;
	}

	function onCodeInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		code = value;
		codeError = null;
		// Edge-triggered: fire on the input that reaches a fresh six-digit code.
		if (/^\d{6}$/.test(value) && value !== lastSubmittedCode && !verifying) {
			void submit();
		}
	}

	async function submit() {
		const candidate = code;
		if (!/^\d{6}$/.test(candidate) || verifying) return;
		verifying = true;
		lastSubmittedCode = candidate;
		codeError = null;
		try {
			const { user } = await verifyOtp(email, candidate);
			setSignedIn(user);
			await goto(resolve('/'));
		} catch (err) {
			if (isHttpError400(err)) {
				codeError = CODE_INVALID_MESSAGE;
			} else {
				errorSnack = true;
			}
		} finally {
			verifying = false;
		}
	}
</script>

<div class="screen">
	<div class="icon-disc">
		<Icon name="mail-check" size={36} />
	</div>

	<h1 class="heading" data-test="login-check-heading">Check your inbox</h1>

	<p class="body">
		We sent a link and a code to <b data-test="login-check-email">{email}</b>. Tap the link on this
		device, or enter the code below.
	</p>

	<div class="resend-row">
		<span>Didn't get it? </span>
		<Button
			variant="text"
			tone="primary"
			size="sm"
			type="button"
			disabled={sending}
			data-test="login-check-resend"
			onclick={onSendAgain}
		>
			Send again
		</Button>
		{#if confirmation}
			<span class="confirmation" data-test="login-check-resend-confirmation">Sent again.</span>
		{/if}
	</div>

	<div class="code-field">
		<TextInput
			value={code}
			inputmode="numeric"
			autocomplete="one-time-code"
			maxlength={6}
			placeholder="000000"
			data-test="login-check-code"
			oninput={onCodeInput}
		/>
		{#if codeError}
			<div class="inline-error" data-test="login-check-code-error">{codeError}</div>
		{/if}
		<Button
			variant="rect"
			tone="primary"
			type="button"
			disabled={!codeValid || verifying}
			data-test="login-check-verify"
			onclick={submit}
		>
			Sign in
		</Button>
	</div>
</div>

<Snackbar
	open={errorSnack}
	message={SNACKBAR_MESSAGE}
	onclose={() => (errorSnack = false)}
	data-test="login-check-snackbar"
/>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 80px 28px 40px;
	}

	.icon-disc {
		width: 84px;
		height: 84px;
		border-radius: 99px;
		background: var(--sage-bg, color-mix(in srgb, var(--sage) 18%, transparent));
		color: var(--sage);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 24px;
	}

	.heading {
		font-family: 'Newsreader', Georgia, serif;
		font-size: 28px;
		font-weight: 500;
		color: var(--ink);
		letter-spacing: -0.01em;
		line-height: 1.2;
		margin: 0;
	}

	.body {
		margin-top: 14px;
		font-size: 15px;
		color: var(--ink-soft, var(--stone));
		line-height: 1.5;
		max-width: 280px;
	}

	.body b {
		color: var(--ink);
		font-weight: 600;
	}

	.resend-row {
		margin-top: 28px;
		font-size: 13px;
		color: var(--stone);
	}

	.confirmation {
		margin-left: 8px;
		color: var(--sage, var(--ink-soft));
	}

	.code-field {
		margin-top: 28px;
		width: 100%;
		max-width: 280px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.inline-error {
		color: var(--ember, #b00020);
		font-size: 13px;
		text-align: left;
	}
</style>
