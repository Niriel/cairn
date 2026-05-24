<script lang="ts">
	import type { Snippet } from 'svelte';
	let { left, right }: { left: Snippet; right: Snippet } = $props();
</script>

{@render left()}
{@render right()}
