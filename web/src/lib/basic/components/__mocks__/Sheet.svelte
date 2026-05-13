<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		open: boolean;
		onclose?: () => void;
		children?: Snippet;
		'data-test'?: string;
	};

	let { open, children, ...rest }: Props = $props();
</script>

{#if open}
	<div data-test={rest['data-test']}>{@render children?.()}</div>
{/if}
