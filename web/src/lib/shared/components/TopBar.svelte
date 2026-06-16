<script lang="ts">
	import type { Snippet } from 'svelte';

	import Icon from '$lib/basic/components/Icon.svelte';
	import { ICON_SIZE } from '$lib/shared/model/constants';

	let {
		showBack = true,
		left,
		right,
		sub,
		subAfter,
		children,
		...rest
	}: {
		showBack?: boolean;
		left?: Snippet;
		right?: Snippet;
		sub?: string;
		// Rich trailing content for the sub line (e.g. an icon + label), rendered
		// inline after the `sub` text — the plain `sub` string can't hold markup.
		subAfter?: Snippet;
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
				<Icon name="chevron-left" size={ICON_SIZE} />
			</button>
		{/if}
	</div>
	<div class="middle">
		<h1>{@render children()}</h1>
		{#if sub || subAfter}<p class="sub caption">
				{sub}{#if subAfter}{@render subAfter()}{/if}
			</p>{/if}
	</div>
	<div class="right">
		{#if right}
			{@render right()}
		{/if}
	</div>
</header>

<style>
	/* Single-instance top-bar chrome: the paper background, ink foreground and
	   hairline base rule are bespoke to this fixed bar, not global type drift. */
	header {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		min-height: 3.5rem;
		padding: calc(env(safe-area-inset-top) + 0.75rem) calc(env(safe-area-inset-right) + 0.8rem)
			0.75rem calc(env(safe-area-inset-left) + 0.8rem);
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
		/* Nothing ever renders under the sub line, so the inherited block margins
		   (a tiny top, a useless bottom) only push the bar around — drop both. */
		margin: 0;
	}

	/* Bar action button: a transparent ink-tinted icon target — chrome local to
	   this single-instance bar. The tap-target floor centres the ICON_SIZE glyph
	   inside it. */
	.icon-btn {
		background: none;
		border: none;
		padding: 0.25rem;
		min-width: var(--tap-target);
		min-height: var(--tap-target);
		color: var(--ink);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Icon buttons handed in via the left/right slots (IconButton, MoreButton,
	   RefreshButton) share the same tap-target floor as the built-in back button.
	   Scoped to the slots so it never touches the in-content variants of these
	   buttons (e.g. the per-row ⋮), which carry their own alignment invariants,
	   nor the plain text Buttons some sheets put in these slots. */
	.left :global(.icon-btn),
	.left :global(.refresh-btn),
	.right :global(.icon-btn),
	.right :global(.refresh-btn) {
		min-width: var(--tap-target);
		min-height: var(--tap-target);
	}
</style>
