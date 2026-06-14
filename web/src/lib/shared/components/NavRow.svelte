<script lang="ts">
	import type { Snippet } from 'svelte';

	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';

	type Props = {
		lead?: Snippet;
		title: string;
		sub?: string;
		onclick?: () => void;
		trailing?: Snippet;
		/* 'destructive' renders the row in --ember (for "Delete account" and
		   the like); the lead/chevron icons inherit it via currentColor, the
		   title is overridden below since .row-title pins --ink. */
		tone?: 'ink' | 'destructive';
		'data-test'?: string;
	};

	let { lead, title, sub, onclick, trailing, tone = 'ink', ...rest }: Props = $props();
</script>

<!-- The .nav-row div is inert layout; the <Button> inside is the full-width
     tap target. The class is the hook for the global .nav-rows band, which
     draws both the outer band and the divider between adjacent rows. -->
<div class="nav-row" class:destructive={tone === 'destructive'}>
	<Button variant="text" {tone} size="md" {onclick} data-test={rest['data-test']}>
		{#if lead}{@render lead()}{/if}
		<span class="nav-row-text">
			<span class="nav-row-title row-title">{title}</span>
			{#if sub}<span class="nav-row-sub caption">{sub}</span>{/if}
		</span>
		{#if trailing}{@render trailing()}{/if}
		<Icon name="chevron-right" size={18} />
	</Button>
</div>

<style>
	/* The text column fills the gap between the lead visual and the trailing
	   chevron; min-width:0 lets a long title truncate rather than overflow. */
	.nav-row-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	/* The title used to inherit wrap behaviour from a caller's .name class; now
	   that callers (e.g. the Lists screen) pass a plain title, NavRow owns it:
	   override the <Button>'s base white-space: nowrap so a long title wraps
	   instead of overflowing into the chevron, and break very long tokens. */
	.nav-row-title {
		white-space: normal;
		overflow-wrap: anywhere;
	}

	.nav-row-sub {
		margin-top: 0.125rem;
	}

	/* Top-align the row contents (Button defaults to align-items: center): on a
	   wrapped multi-line title the trailing marker and chevron pin to the top of
	   the name rather than centring against it (docs/ui.md "Row navigation
	   pattern"). A no-op for single-line labels. */
	.nav-row :global(button) {
		align-items: flex-start;
	}

	/* The Button's tone="destructive" already colours the lead and chevron
	   icons via currentColor; the title needs an explicit override because the
	   global .row-title role pins color to --ink. */
	.nav-row.destructive .nav-row-title {
		color: var(--ember);
	}
</style>
