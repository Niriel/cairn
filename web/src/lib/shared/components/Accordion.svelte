<script lang="ts">
	import type { Snippet } from 'svelte';

	import Icon from '$lib/basic/components/Icon.svelte';
	import { pushHistoryGuard } from '$lib/shared/state/back-stack.svelte';

	let {
		expanded,
		pushesHistory,
		onexpand,
		oncollapse,
		header,
		body,
		...rest
	}: {
		expanded: boolean;
		pushesHistory: boolean;
		onexpand: () => void;
		oncollapse: () => void;
		header: Snippet;
		body: Snippet;
		['data-test']?: string;
	} = $props();

	$effect(() => {
		if (!expanded) return;
		if (!pushesHistory) return;
		return pushHistoryGuard(() => oncollapse());
	});

	function toggle() {
		if (expanded) oncollapse();
		else onexpand();
	}
</script>

<div data-test={rest['data-test']}>
	<button
		type="button"
		class="header"
		data-test={rest['data-test'] ? `${rest['data-test']}-header` : undefined}
		onclick={toggle}
	>
		<span class="chevron" class:expanded>
			<Icon name="chevron-right" />
		</span>
		{@render header()}
	</button>
	{#if expanded}
		<div class="body">
			{@render body()}
		</div>
	{/if}
</div>

<style>
	.header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0;
		background: transparent;
		border: none;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.chevron {
		display: inline-flex;
		transition: transform 150ms ease;
	}

	.chevron.expanded {
		transform: rotate(90deg);
	}

	.body {
		padding: 0.5rem 0 0 1.5rem;
	}
</style>
