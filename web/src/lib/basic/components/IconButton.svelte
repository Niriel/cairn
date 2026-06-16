<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		children?: Snippet;
	};

	let { children, ...rest }: Props = $props();
</script>

<button class="icon-btn" {...rest}>{@render children?.()}</button>

<style>
	.icon-btn {
		background: none;
		border: none;
		padding: 4px;
		min-width: 44px;
		min-height: 44px;
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
