<script lang="ts">
	import type { Snippet } from 'svelte';

	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';

	let {
		showBack = true,
		right,
		children,
		...rest
	}: {
		showBack?: boolean;
		right?: Snippet;
		children: Snippet;
		['data-test']?: string;
	} = $props();
</script>

<header data-test={rest['data-test']}>
	<div class="left">
		{#if showBack}
			<Button variant="ghost" onclick={() => history.back()} data-test="topbar-back">
				<Icon name="chevron-left" />
			</Button>
		{/if}
	</div>
	<div class="centre">
		{@render children()}
	</div>
	<div class="right">
		{#if right}
			{@render right()}
		{/if}
	</div>
</header>

<style>
	header {
		display: flex;
		align-items: center;
		min-height: 56px;
		padding: calc(env(safe-area-inset-top) + 12px) calc(env(safe-area-inset-right) + 18px) 12px
			calc(env(safe-area-inset-left) + 18px);
		background: var(--paper);
		color: var(--ink);
		border-bottom: 1px solid var(--rule);
	}

	.left,
	.right {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
	}

	.centre {
		flex: 1 1 auto;
		min-width: 0;
		text-align: center;
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 22px;
		font-weight: 500;
		letter-spacing: -0.01em;
		line-height: 1.1;
	}
</style>
