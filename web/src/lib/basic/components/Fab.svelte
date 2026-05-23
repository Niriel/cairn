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

<button type="button" {onclick} {...rest}>
	{@render children?.()}
</button>

<style>
	button {
		position: fixed;
		bottom: var(--fab-bottom);
		right: max(16px, calc(50% - var(--app-max-w) / 2 + 16px));
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
		cursor: pointer;
	}
</style>
