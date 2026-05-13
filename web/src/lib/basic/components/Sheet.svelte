<script lang="ts">
	import type { Snippet } from 'svelte';

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
		return pushHistoryGuard(() => onclose());
	});
</script>

{#if open}
	<div data-test={rest['data-test']}>
		{@render children?.()}
	</div>
{/if}

<style>
	div {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		background: var(--paper);
		padding: 1rem calc(1rem + env(safe-area-inset-right)) calc(1rem + env(safe-area-inset-bottom))
			calc(1rem + env(safe-area-inset-left));
		box-shadow: var(--shadow);
		border-radius: 16px 16px 0 0;
	}
</style>
