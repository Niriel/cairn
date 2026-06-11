<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		variant?: 'rect' | 'pill' | 'text' | 'link';
		tone?: 'primary' | 'ink' | 'destructive';
		size?: 'sm' | 'md';
		leadingIcon?: string;
		disabled?: boolean;
		type?: 'button' | 'submit';
		onclick?: () => void;
		children?: Snippet;
		'data-test'?: string;
		'aria-pressed'?: boolean;
	};

	let { children, onclick, ...rest }: Props = $props();
</script>

<button
	data-test={rest['data-test']}
	data-tone={rest.tone}
	aria-pressed={rest['aria-pressed']}
	{onclick}>{@render children?.()}</button
>
