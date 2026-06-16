<script lang="ts">
	import type { Snippet } from 'svelte';

	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';

	type Props = {
		title: string;
		/* Whether the row's panel is unfolded. Drives the chevron: pointing right
		   when folded, rotated a quarter-turn to point down when unfolded. */
		open?: boolean;
		onclick?: () => void;
		/* Trailing slot, sat between the title and the chevron — mirrors NavRow's
		   trailing slot (where the Lists screen puts its public globe). */
		trailing?: Snippet;
		'data-test'?: string;
	};

	let { title, open = false, onclick, trailing, ...rest }: Props = $props();
</script>

<!-- The sibling of NavRow: a full-width tap target that toggles an inline panel
     rather than navigating. Same .rows band + divider model as NavRow; the
     class is the hook the consumer's .row wrapper styles around. -->
<div class="accordion-row" class:open>
	<Button variant="text" tone="ink" size="md" {onclick} data-test={rest['data-test']}>
		<span class="accordion-row-title row-title">{title}</span>
		{#if trailing}<span class="trailing">{@render trailing()}</span>{/if}
		<span class="chevron" aria-hidden="true">
			<Icon name="chevron-right" size={24} />
		</span>
	</Button>
</div>

<style>
	/* The title fills the gap to the trailing chevron; min-width:0 + wrap let a
	   long title wrap rather than overflow, overriding the Button's nowrap. Same
	   shape as NavRow's .nav-row-title.

	   The padding-block centres the title's *first line* within a 44px band: the
	   symmetric inset equals half the slack between the 44px tap target and one
	   line-height (`1lh`), so a single-line title is exactly 44px tall and its
	   text sits on the 22px midline, while a wrapped title keeps that first line
	   pinned at 22px and grows downward. That 22px midline is exactly where the
	   trailing badge and chevron centre their content, so all three line up on a
	   single row and the badge/chevron pin to the first line when the title wraps
	   — no line-height constant baked in. */
	.accordion-row-title {
		flex: 1;
		min-width: 0;
		white-space: normal;
		overflow-wrap: anywhere;
		box-sizing: border-box;
		padding-block: calc((44px - 1lh) / 2);
	}

	/* Top-align the row contents so the title can grow downward when it wraps;
	   each child centres its own content within a 44px band (above and below), so
	   on a single line everything sits on the same 22px midline. The button's
	   inset is left to the consumer (e.g. the Items screen tightens it to match
	   the Lists nav-rows): an override here can't beat Button's own `.text.size-md`
	   padding on specificity, so it belongs at the call site — the same place
	   NavRow's consumers set theirs. */
	.accordion-row :global(button) {
		align-items: flex-start;
	}

	/* The trailing badge shares the chevron's 44px band so it centres on the
	   first line alongside it; flex-shrink keeps it from collapsing. */
	.trailing {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		min-height: 44px;
	}

	/* The fold indicator. chevron-right rotates a quarter-turn to point down when
	   the panel opens; the small transition makes the toggle legible. flex-shrink
	   keeps it from being squeezed by a long wrapping title. The box is sized to a
	   44×44 minimum tap target (the 18px glyph sits centred inside it). */
	.chevron {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		min-width: 44px;
		min-height: 44px;
		transition: transform 0.09s ease;
	}

	.accordion-row.open .chevron {
		transform: rotate(90deg);
	}
</style>
