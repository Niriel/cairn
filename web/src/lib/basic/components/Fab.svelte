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
		border-radius: 18px;
		background: var(--ink);
		color: var(--paper);
		box-shadow:
			0 8px 24px rgba(60, 40, 20, 0.25),
			0 2px 6px rgba(60, 40, 20, 0.15);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
</style>
