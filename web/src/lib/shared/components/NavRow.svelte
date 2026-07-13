<script lang="ts">
	import type { Snippet } from 'svelte';

	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import { ICON_SIZE } from '$lib/shared/model/constants';

	type Props = {
		lead?: Snippet;
		title: string;
		sub?: string;
		/* A person's public @username, rendered beneath the title on the muted
		   .identity-handle role (the @ is added here). For identity chips only;
		   distinct from `sub`, which is a generic caption. */
		handle?: string;
		onclick?: () => void;
		trailing?: Snippet;
		/* 'destructive' renders the row in --ember (for "Delete account" and
		   the like); the lead/chevron icons inherit it via currentColor, the
		   title is overridden below since .row-title pins --ink. */
		tone?: 'ink' | 'destructive';
		'data-test'?: string;
	};

	let { lead, title, sub, handle, onclick, trailing, tone = 'ink', ...rest }: Props = $props();
</script>

<!-- The .nav-row div is inert layout; the <Button> inside is the full-width
     tap target. The class is the hook for the global .nav-rows band, which
     draws both the outer band and the divider between adjacent rows. -->
<div class="nav-row" class:destructive={tone === 'destructive'}>
	<Button variant="text" {tone} size="md" {onclick} data-test={rest['data-test']}>
		{#if lead}<span class="nav-row-lead">{@render lead()}</span>{/if}
		<span class="nav-row-text">
			<span class="nav-row-title row-title">{title}</span>
			{#if handle}<span class="nav-row-handle identity-handle">@{handle}</span>{/if}
			{#if sub}<span class="nav-row-sub caption">{sub}</span>{/if}
		</span>
		{#if trailing}<span class="nav-row-trailing">{@render trailing()}</span>{/if}
		<span class="nav-row-chevron" aria-hidden="true">
			<Icon name="chevron-right" size={ICON_SIZE} />
		</span>
	</Button>
</div>

<style>
	/* The text column fills the gap between the lead visual and the trailing
	   chevron; min-width:0 lets a long title truncate rather than overflow.

	   The padding-block centres the title's *first line* within a 44px band: the
	   symmetric inset equals half the slack between the 44px tap target and one
	   line-height (`1lh`), so a single-line title sits on the 22px midline (where
	   the lead/trailing/chevron bands centre their glyphs too) while a wrapped
	   title — or a title with a sub line below it — keeps that first line pinned
	   at 22px and grows downward. Same technique as AccordionRow; no line-height
	   constant baked in. */
	.nav-row-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		padding-block: calc((var(--tap-target) - 1lh) / 2);
	}

	/* The title used to inherit wrap behaviour from a caller's .name class; now
	   that callers (e.g. the Lists screen) pass a plain title, NavRow owns it:
	   override the <Button>'s base white-space: nowrap so a long title wraps
	   instead of overflowing into the chevron, and break very long tokens. */
	.nav-row-title {
		white-space: normal;
		overflow-wrap: anywhere;
	}

	.nav-row-handle,
	.nav-row-sub {
		margin-top: 0.125rem;
	}

	/* Lead visual, trailing marker and chevron each centre their content within a
	   tap-target-tall band so they sit on the same midline as the title's first
	   line. flex-shrink keeps them from being squeezed by a long wrapping title. */
	.nav-row-lead,
	.nav-row-trailing,
	.nav-row-chevron {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		min-height: var(--tap-target);
	}

	/* The chevron also gets a tap-target width, so it's a square box matching
	   AccordionRow: its glyph centres at (button padding-right + half the box).
	   That shared geometry is what lets callers (e.g. the Lists screen) pin a
	   per-card ⋮ — itself a tap-target IconButton — directly under the chevron
	   with `right` set to the row button's padding-right. */
	.nav-row-chevron {
		min-width: var(--tap-target);
	}

	/* Top-align the row contents (Button defaults to align-items: center) so the
	   text column can grow downward; each child centres within its own band, so on
	   a single line everything lines up on the midline and on a wrapped title the
	   lead/marker/chevron pin to the first line (docs/ui.md "Row navigation
	   pattern"). min-height makes the row itself a tap target. */
	.nav-row :global(button) {
		align-items: flex-start;
		min-height: var(--tap-target);
	}

	/* Button's .text.size-md ships 0.75rem of vertical padding, but the 44px
	   content bands already give the row its height — the padding would only
	   inflate it (~68px). Zero it; the band's own interior space keeps the row
	   from looking cramped. Needs `button.text` to out-specify .text.size-md;
	   the horizontal inset is left to .text.size-md (or the call site). */
	.nav-row :global(button.text) {
		padding-block: 0;
	}

	/* The Button's tone="destructive" already colours the lead and chevron
	   icons via currentColor; the title needs an explicit override because the
	   global .row-title role pins color to --ink. */
	.nav-row.destructive .nav-row-title {
		color: var(--ember);
	}
</style>
