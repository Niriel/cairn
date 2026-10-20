<script lang="ts">
	import type { Snippet } from 'svelte';

	import TopBar from '$lib/shared/components/TopBar.svelte';

	// The shell shared by every legal sub-screen: a plain TopBar (these pages are
	// public, so there may be no signed-in user to name) over a prose body.
	let {
		title,
		sub,
		children,
		...rest
	}: {
		title: string;
		sub?: string;
		children: Snippet;
		['data-test']?: string;
	} = $props();
</script>

<div class="screen" data-test={rest['data-test']}>
	<TopBar {sub}>{title}</TopBar>
	<div class="screen-body">
		<article class="prose">
			{@render children()}
		</article>
	</div>
</div>

<style>
	.screen-body {
		padding: 1.25rem 1.375rem 2.25rem;
	}
</style>
