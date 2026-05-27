<script lang="ts">
	import type { Snippet } from 'svelte';
	type Props = {
		onclick?: () => void;
		'aria-label'?: string;
		'data-test'?: string;
		disabled?: boolean;
		children?: Snippet;
	};
	let { children, onclick, disabled, ...rest }: Props = $props();
</script>

<button
	type="button"
	data-test={rest['data-test']}
	aria-label={rest['aria-label']}
	{onclick}
	{disabled}>{@render children?.()}</button
>
