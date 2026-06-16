<script lang="ts">
	import type { Snippet } from 'svelte';

	import PostAcceptPromptSheet from '$lib/invite/components/PostAcceptPromptSheet.svelte';
	import { invitations } from '$lib/invite/state/invitations.svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<div class="app-pages">
	{@render children?.()}
</div>

{#if invitations.postAcceptPrompts.size > 0}
	<PostAcceptPromptSheet />
{/if}

<style>
	/*
	 * Standard bottom gutter for every authenticated screen, applied once here
	 * in the (app) shell rather than repeated per screen. Without it the last
	 * row/control kisses the viewport edge, which reads as "there's more below".
	 * The value is --fab-clearance: on screens with a FAB it doubles as the
	 * clearance that keeps the last row from hiding under the floating button;
	 * on screens without one it's just breathing room. See docs/ui.md.
	 *
	 * `display: contents` so the wrapper adds no box and leaves each screen's
	 * height chain (the `.screen { min-height: 100% }` body-scroll model)
	 * untouched. .no-gutter opts out the fixed-viewport AvatarCrop UI.
	 */
	.app-pages {
		display: contents;
	}
	.app-pages :global(.screen:not(.no-gutter)) {
		padding-bottom: var(--fab-clearance);
	}
</style>
