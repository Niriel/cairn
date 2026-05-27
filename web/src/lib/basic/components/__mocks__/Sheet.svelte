<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		open: boolean;
		onclose?: () => void;
		children?: Snippet;
		'data-test'?: string;
	};

	let { open, onclose, children, ...rest }: Props = $props();
</script>

{#if open}
	<div data-test={rest['data-test']}>
		<button data-test="sheet-close" aria-label="close" onclick={onclose}></button>
		{@render children?.()}
	</div>
{/if}
