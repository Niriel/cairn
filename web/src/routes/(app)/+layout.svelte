<script lang="ts">
	import type { Snippet } from 'svelte';

	import PostAcceptPromptSheet from '$lib/invite/components/PostAcceptPromptSheet.svelte';
	import { invitations } from '$lib/invite/state/invitations.svelte';

	let { children }: { children?: Snippet } = $props();
</script>

{@render children?.()}

{#if invitations.postAcceptPrompts.size > 0}
	<PostAcceptPromptSheet />
{/if}
