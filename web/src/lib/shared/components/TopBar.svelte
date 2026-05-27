<script lang="ts">
	import type { Snippet } from 'svelte';

	import Icon from '$lib/basic/components/Icon.svelte';

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
</script>

<header data-test={rest['data-test']}>
	<div class="left">
		{#if left}
			{@render left()}
		{:else if showBack}
			<button class="icon-btn" onclick={() => history.back()} data-test="topbar-back">
				<Icon name="chevron-left" size={22} />
			</button>
		{/if}
	</div>
	<div class="centre">
		{@render children()}
		{#if sub}<div class="sub">{sub}</div>{/if}
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
		align-items: flex-start;
		gap: 10px;
		min-height: 56px;
		padding: calc(env(safe-area-inset-top) + 12px) calc(env(safe-area-inset-right) + 18px) 12px
			calc(env(safe-area-inset-left) + 18px);
		background: var(--paper);
		color: var(--ink);
		border-bottom: 1px solid var(--rule);
	}

	.left {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.right {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.centre {
		flex: 1;
		min-width: 0;
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 22px;
		font-weight: 500;
		letter-spacing: -0.01em;
		line-height: 1.1;
	}

	.sub {
		font-family: inherit;
		font-size: 12px;
		font-weight: 400;
		letter-spacing: normal;
		color: var(--stone);
		margin-top: 2px;
		line-height: 1.3;
	}

	.icon-btn {
		background: none;
		border: none;
		padding: 4px;
		color: var(--ink);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
