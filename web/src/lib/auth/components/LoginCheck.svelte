<script lang="ts">
	import { sendMagicLink } from '$lib/auth/model/auth-client';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';

	type Props = { email: string };
	let { email }: Props = $props();

	let sending = $state(false);
	let confirmation = $state(false);
	let confirmationTimer: ReturnType<typeof setTimeout> | null = null;

	async function onSendAgain() {
		if (sending) return;
		sending = true;
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
	}
</script>

<div class="screen">
	<div class="icon-disc">
		<Icon name="mail-check" size={36} />
	</div>

	<h1 class="heading" data-test="login-check-heading">Check your inbox</h1>

	<p class="body">
		We sent a link to <b data-test="login-check-email">{email}</b>. Tap it on this device to
		continue.
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
</div>

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
</style>
