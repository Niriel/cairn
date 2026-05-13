<script lang="ts">
	import type { Snippet } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import '$lib/shared/styles/tokens.css';
	import '$lib/shared/styles/reset.css';
	import '$lib/shared/styles/typography.css';
	import '$lib/shared/state/preferences.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
