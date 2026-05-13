<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		variant?: 'primary' | 'ghost' | 'destructive';
		disabled?: boolean;
		type?: 'button' | 'submit';
		onclick?: () => void;
		children?: Snippet;
		'data-test'?: string;
	};

	let { children, onclick, ...rest }: Props = $props();
</script>

<button data-test={rest['data-test']} {onclick}>{@render children?.()}</button>
