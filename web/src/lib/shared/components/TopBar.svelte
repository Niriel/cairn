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
	<div class="middle">
		<h1>{@render children()}</h1>
		{#if sub}<p class="sub caption">{sub}</p>{/if}
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
		gap: 0.625rem;
		min-height: 3.5rem;
		padding: calc(env(safe-area-inset-top) + 0.75rem) calc(env(safe-area-inset-right) + 1.125rem)
			0.75rem calc(env(safe-area-inset-left) + 1.125rem);
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

	.middle {
		flex: 1;
		min-width: 0;
	}

	.sub {
		margin-top: 0.125rem;
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
