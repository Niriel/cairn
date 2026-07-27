<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		onclick?: () => void;
		disabled?: boolean;
		'aria-label'?: string;
		'data-test'?: string;
		children?: Snippet;
	};

	let { children, onclick, disabled = false, ...rest }: Props = $props();
</script>

<button
	type="button"
	{disabled}
	data-test={rest['data-test']}
	aria-label={rest['aria-label']}
	{onclick}>{@render children?.()}</button
>
