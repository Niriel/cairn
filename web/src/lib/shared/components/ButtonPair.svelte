<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		left,
		right,
		...rest
	}: {
		left: Snippet;
		right: Snippet;
		['data-test']?: string;
	} = $props();
</script>

<div data-test={rest['data-test']}>
	{@render left()}
	{@render right()}
</div>

<style>
	div {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	@media (max-width: 360px) {
		div {
			flex-direction: column;
		}
	}
</style>
