<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children, ...rest } = $props<{ children?: Snippet; [k: string]: unknown }>();
</script>

<button data-test={rest['data-test']}>{@render children?.()}</button>
