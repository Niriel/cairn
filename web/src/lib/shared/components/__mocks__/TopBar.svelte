<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		showBack?: boolean;
		right?: Snippet;
		children: Snippet;
		'data-test'?: string;
	};

	let { right, children, ...rest }: Props = $props();
</script>

<header data-test={rest['data-test']}>
	{@render children()}
	{#if right}{@render right()}{/if}
</header>
