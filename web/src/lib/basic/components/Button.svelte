<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'ghost' | 'destructive';

	type Props = {
		variant?: Variant;
		disabled?: boolean;
		type?: 'button' | 'submit';
		onclick?: () => void;
		children?: Snippet;
		'data-test'?: string;
		'aria-pressed'?: boolean;
	};

	let {
		variant = 'primary',
		disabled = false,
		type = 'button',
		onclick,
		children,
		...rest
	}: Props = $props();

	function handleClick() {
		if (disabled) return;
		onclick?.();
	}
</script>

<button
	class:primary={variant === 'primary'}
	class:ghost={variant === 'ghost'}
	class:destructive={variant === 'destructive'}
	{disabled}
	{type}
	onclick={handleClick}
	{...rest}
>
	{@render children?.()}
</button>

<style>
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		border: none;
		font: inherit;
		line-height: 1;
	}

	.primary {
		background: var(--accent);
		color: var(--paper);
	}

	.ghost {
		background: transparent;
		color: var(--ink);
	}

	.destructive {
		background: var(--ember);
		color: var(--paper);
	}
</style>
