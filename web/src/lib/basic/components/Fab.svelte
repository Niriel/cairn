<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		onclick?: () => void;
		'aria-label'?: string;
		'data-test'?: string;
		children?: Snippet;
	};

	let { onclick, children, ...rest }: Props = $props();
</script>

<button
	type="button"
	style="position: fixed; bottom: var(--fab-bottom); right: 16px;"
	{onclick}
	{...rest}
>
	{@render children?.()}
</button>

<style>
	button {
		width: 56px;
		height: 56px;
		border: none;
		border-radius: 50%;
		background: var(--accent);
		color: var(--paper);
		box-shadow: var(--shadow);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
</style>
