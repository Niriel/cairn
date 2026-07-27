<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import { install } from '$lib/pwa/state/install.svelte';

	// The manual fallback for anyone the browser won't let us prompt. On iOS
	// that's everybody, and the gesture is precise enough to walk through step
	// by step. Elsewhere it's the handful of browsers with no
	// `beforeinstallprompt` (Firefox, say), where the menu item exists but its
	// name and location vary — so the copy stays generic and names no browser
	// rather than confidently describing the wrong one.

	type Props = {
		open: boolean;
		onclose: () => void;
	};

	let { open, onclose }: Props = $props();
</script>

<Sheet {open} {onclose} data-test="install-explainer-sheet">
	{#if install.isIos}
		<h2 class="t-hero">Add Cairn to your Home Screen</h2>

		<p class="intro body">
			Safari can keep Cairn on your home screen, where it opens full-screen — no address bar — and
			still shows your lists when you're offline. It takes two taps.
		</p>

		<ol class="steps">
			<li class="step">
				<span class="step-glyph" aria-hidden="true"><Icon name="share" size={20} /></span>
				<span class="step-body body"
					>Tap the <strong>Share</strong> button in Safari's toolbar.</span
				>
			</li>
			<li class="step">
				<span class="step-glyph" aria-hidden="true"><Icon name="plus" size={20} /></span>
				<span class="step-body body"
					>Scroll down the share sheet and choose <strong>Add to Home Screen</strong>.</span
				>
			</li>
		</ol>
	{:else}
		<h2 class="t-hero">Install Cairn</h2>

		<p class="intro body">
			Installed, Cairn opens in its own window — no address bar — and still shows your lists when
			you're offline.
		</p>

		<p class="intro body">
			Your browser doesn't offer us a one-tap install, but it can most likely still do it: open its
			menu and look for <strong>Install</strong> or <strong>Add to Home screen</strong>.
		</p>
	{/if}

	<p class="footer card-alt caption">
		Nothing is sent anywhere — the icon is just a shortcut your device keeps.
	</p>

	<div class="got-it-wrap">
		<Button variant="rect" tone="ink" size="md" onclick={onclose}>Got it</Button>
	</div>
</Sheet>

<style>
	h2 {
		margin-bottom: 0.75rem;
	}

	.intro {
		margin-bottom: 1rem;
	}

	.steps {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.step {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.step-glyph {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 2rem;
		height: 2rem;
		border: 1px solid var(--rule);
		border-radius: 8px;
	}

	.step-body {
		margin: 0;
		flex: 1;
	}

	.footer {
		padding: 0.75rem 0.875rem;
		margin-top: 1.125rem;
	}

	.got-it-wrap {
		margin-top: 1.125rem;
	}

	.got-it-wrap :global(button) {
		width: 100%;
	}
</style>
