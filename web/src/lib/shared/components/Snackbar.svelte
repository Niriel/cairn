<script lang="ts">
	import type { Snippet } from 'svelte';

	import IconButton from '$lib/basic/components/IconButton.svelte';

	let {
		open,
		message,
		leading,
		children,
		actionLabel,
		onaction,
		onclose,
		persistent = false,
		...rest
	}: {
		open: boolean;
		message?: string;
		leading?: Snippet;
		children?: Snippet;
		actionLabel?: string;
		onaction?: () => void;
		onclose: () => void;
		// A persistent snackbar stays until the user acts or dismisses it —
		// right for a release prompt. The default is the timed, control-less
		// undo snackbar, so existing call sites are unaffected.
		persistent?: boolean;
		['data-test']?: string;
	} = $props();

	$effect(() => {
		if (!open || persistent) return;
		const id = setTimeout(() => onclose(), 6000);
		return () => clearTimeout(id);
	});
</script>

{#if open}
	<div data-test={rest['data-test']} role="status">
		{@render leading?.()}
		{#if children}{@render children()}{:else}<span class="message">{message}</span>{/if}
		{#if actionLabel}
			<button
				type="button"
				class="action"
				data-test={rest['data-test'] ? `${rest['data-test']}-action` : undefined}
				onclick={() => onaction?.()}
			>
				{actionLabel}
			</button>
		{/if}
		{#if persistent}
			<IconButton
				icon="x"
				aria-label="Dismiss"
				data-test={rest['data-test'] ? `${rest['data-test']}-dismiss` : undefined}
				onclick={() => onclose()}
			/>
		{/if}
	</div>
{/if}

<style>
	div {
		position: fixed;
		left: max(12px, calc(50% - var(--app-max-w) / 2 + 12px));
		right: max(12px, calc(50% - var(--app-max-w) / 2 + 12px));
		bottom: calc(env(safe-area-inset-bottom) + 18px);
		background: var(--ink);
		color: var(--paper);
		padding: 0.75rem 1rem;
		border-radius: 8px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
	}

	.message {
		flex: 1 1 auto;
		min-width: 0;
	}

	.action {
		flex: 0 0 auto;
		background: transparent;
		border: none;
		color: var(--paper);
		font: inherit;
		padding: 0 0.5rem;
		cursor: pointer;
	}
</style>
