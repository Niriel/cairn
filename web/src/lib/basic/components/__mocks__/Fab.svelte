<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		onclick?: () => void;
		'aria-label'?: string;
		'data-test'?: string;
		children?: Snippet;
	};

	let { children, onclick, ...rest }: Props = $props();
</script>

<button type="button" data-test={rest['data-test']} aria-label={rest['aria-label']} {onclick}
	>{@render children?.()}</button
>
