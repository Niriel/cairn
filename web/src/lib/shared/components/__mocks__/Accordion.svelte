<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		expanded: boolean;
		pushesHistory: boolean;
		onexpand: () => void;
		oncollapse: () => void;
		header: Snippet;
		body: Snippet;
		'data-test'?: string;
	};

	let { expanded, header, body, ...rest }: Props = $props();
</script>

<div data-test={rest['data-test']}>
	{@render header()}
	{#if expanded}
		{@render body()}
	{/if}
</div>
