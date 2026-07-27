<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import IconButton from '$lib/basic/components/IconButton.svelte';
	import InstallExplainerSheet from '$lib/pwa/components/InstallExplainerSheet.svelte';
	import { install } from '$lib/pwa/state/install.svelte';

	// A dismissible first-launch nudge towards installing. Unlike WelcomeBanner
	// — which self-clears on the profile name and has no dismiss — this one
	// carries its own dismissal, because there's no other signal that the user
	// has considered and declined installing.

	let explainerOpen = $state(false);

	// Nothing to offer if we're already installed, if the user waved it away,
	// or on a browser that neither prompts nor has a documented manual path.
	const visible = $derived(
		!install.isStandalone && !install.hintDismissed && (install.canPrompt || install.isIos)
	);

	function onInstall() {
		if (install.canPrompt) {
			void install.promptInstall();
			return;
		}
		explainerOpen = true;
	}
</script>

{#if visible}
	<div class="hint card-alt" data-test="install-hint">
		<div class="head">
			<h3>Install Cairn</h3>
			<IconButton
				icon="x"
				aria-label="Dismiss"
				data-test="install-hint-dismiss"
				onclick={() => install.dismissHint()}
			/>
		</div>
		<p class="body">
			Keep Cairn on your home screen — it opens full-screen and still shows your lists when you're
			offline.
		</p>
		<div class="action">
			<Button
				variant="rect"
				tone="ink"
				size="sm"
				leadingIcon="download"
				data-test="install-hint-install"
				onclick={onInstall}
			>
				Install
			</Button>
		</div>
	</div>
{/if}

<InstallExplainerSheet open={explainerOpen} onclose={() => (explainerOpen = false)} />

<style>
	.hint {
		margin: 0.5rem 1.125rem;
		padding: 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	/* The dismiss control's tap target would otherwise stretch the banner. */
	.head :global(button) {
		margin: -0.5rem -0.375rem -0.5rem 0;
	}

	.action {
		margin-top: 0.25rem;
		display: flex;
	}
</style>
