<script lang="ts">
	import type { Snippet } from 'svelte';

	import { profile } from '$lib/shared/state/profile.svelte';
	import TopBar from './TopBar.svelte';

	let {
		showBack = true,
		left,
		right,
		sub,
		children,
		...rest
	}: {
		showBack?: boolean;
		left?: Snippet;
		right?: Snippet;
		sub?: string;
		children: Snippet;
		['data-test']?: string;
	} = $props();

	const fallbackSub = $derived(
		profile.displayName ? `Signed in as ${profile.displayName}` : undefined
	);
	const resolvedSub = $derived(sub ?? fallbackSub);
</script>

<TopBar {showBack} {left} {right} sub={resolvedSub} data-test={rest['data-test']}>
	{@render children()}
</TopBar>
