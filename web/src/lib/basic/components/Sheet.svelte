<script lang="ts">
	import { untrack, type Snippet } from 'svelte';

	import { pushHistoryGuard } from '$lib/shared/state/back-stack.svelte';

	type Props = {
		open: boolean;
		onclose: () => void;
		children?: Snippet;
		'data-test'?: string;
	};

	let { open, onclose, children, ...rest }: Props = $props();

	$effect(() => {
		if (!open) return;
		// untrack: pushHistoryGuard → pushState reads SvelteKit's internal
		// history state, which would otherwise re-track this effect and
		// tear it down on every subsequent navigation (e.g. a goto from
		// the parent), spuriously firing the back-stack guard.
		return untrack(() => pushHistoryGuard(() => onclose()));
	});

	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onclose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#if open}
	<div class="backdrop" role="presentation" onclick={onclose}></div>
	<div class="sheet" data-test={rest['data-test']}>
		{@render children?.()}
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		left: max(0px, calc(50% - var(--app-max-w) / 2));
		right: max(0px, calc(50% - var(--app-max-w) / 2));
		top: 0;
		bottom: 0;
	}

	.sheet {
		position: fixed;
		left: max(0px, calc(50% - var(--app-max-w) / 2));
		right: max(0px, calc(50% - var(--app-max-w) / 2));
		bottom: 0;
		max-height: calc(100vh - 2rem - env(safe-area-inset-top));
		display: flex;
		flex-direction: column;
		background: var(--paper);
		padding: 1rem calc(1rem + env(safe-area-inset-right)) calc(1rem + env(safe-area-inset-bottom))
			calc(1rem + env(safe-area-inset-left));
		box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.15);
		border-radius: 24px 24px 0 0;
	}
</style>
