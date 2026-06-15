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
		{#if trailing}{@render trailing()}{/if}
		<span class="chevron" aria-hidden="true">
			<Icon name="chevron-right" size={18} />
		</span>
	</Button>
</div>

<style>
	/* The title fills the gap to the trailing chevron; min-width:0 + wrap let a
	   long title wrap rather than overflow, overriding the Button's nowrap. Same
	   shape as NavRow's .nav-row-title. */
	.accordion-row-title {
		flex: 1;
		min-width: 0;
		white-space: normal;
		overflow-wrap: anywhere;
	}

	/* Top-align the row contents (Button centres by default): on a wrapped
	   multi-line title the trailing slot and chevron pin to the first line rather
	   than centring against the whole name — same rule NavRow uses. The tighter
	   inset (vs the Button md default of 0.75rem 1.125rem) buys horizontal real
	   estate and aligns these rows with the Lists screen's nav-rows. */
	.accordion-row :global(button) {
		align-items: flex-start;
		padding: 0.5rem 0.8rem;
	}

	/* The fold indicator. chevron-right rotates a quarter-turn to point down when
	   the panel opens; the small transition makes the toggle legible. flex-shrink
	   keeps it from being squeezed by a long wrapping title. */
	.chevron {
		display: inline-flex;
		flex-shrink: 0;
		transition: transform 0.09s ease;
	}

	.accordion-row.open .chevron {
		transform: rotate(90deg);
	}
</style>
