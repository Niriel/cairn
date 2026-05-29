<script lang="ts">
	import type { Snippet } from 'svelte';

	import type { IconName } from '../model/icon-paths';
	import Icon from './Icon.svelte';

	type Variant = 'rect' | 'pill' | 'text';
	type Tone = 'primary' | 'ink' | 'destructive';
	type Size = 'sm' | 'md';

	type Props = {
		variant?: Variant;
		tone?: Tone;
		size?: Size;
		leadingIcon?: IconName;
		disabled?: boolean;
		type?: 'button' | 'submit';
		onclick?: () => void;
		children?: Snippet;
		'data-test'?: string;
		'aria-pressed'?: boolean;
	};

	let {
		variant = 'rect',
		tone = 'primary',
		size = 'md',
		leadingIcon,
		disabled = false,
		type = 'button',
		onclick,
		children,
		...rest
	}: Props = $props();

	const iconSize = $derived(size === 'sm' ? 14 : 16);

	function handleClick() {
		if (disabled) return;
		onclick?.();
	}
</script>

<button
	class:rect={variant === 'rect'}
	class:pill={variant === 'pill'}
	class:text={variant === 'text'}
	class:tone-primary={tone === 'primary'}
	class:tone-ink={tone === 'ink'}
	class:tone-destructive={tone === 'destructive'}
	class:size-md={size === 'md'}
	class:size-sm={size === 'sm'}
	{disabled}
	{type}
	onclick={handleClick}
	{...rest}
>
	{#if leadingIcon}
		<Icon name={leadingIcon} size={iconSize} />
	{/if}
	{@render children?.()}
</button>

<style>
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		line-height: 1;
		white-space: nowrap;
		border: none;
	}

	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	/* rect variant */
	.rect {
		border-radius: 12px;
	}

	.rect.tone-primary {
		background: var(--accent);
		color: var(--paper);
	}

	.rect.tone-ink {
		background: var(--ink);
		color: var(--paper);
	}

	.rect.tone-destructive {
		background: var(--ember);
		color: var(--paper);
	}

	.rect.size-md {
		padding: 12px 20px;
		font-size: 15px;
	}

	.rect.size-sm {
		padding: 8px 14px;
		font-size: 13px;
	}

	/* pill variant */
	.pill {
		border-radius: 999px;
		background: transparent;
	}

	.pill.tone-primary {
		color: var(--accent);
		border: 1px solid var(--accent);
	}

	.pill.tone-ink {
		color: var(--ink);
		border: 1px solid var(--ink);
	}

	.pill.tone-destructive {
		color: var(--ember);
		border: 1px solid var(--rule);
	}

	.pill.size-sm {
		padding: 7px 14px;
		font-size: 12.5px;
		gap: 6px;
	}

	.pill.size-md {
		padding: 10px 18px;
		font-size: 14px;
		gap: 6px;
	}

	/* text variant */
	.text {
		background: transparent;
		border: none;
	}

	.text.tone-primary {
		color: var(--accent);
	}

	.text.tone-ink {
		color: var(--ink);
	}

	.text.tone-destructive {
		color: var(--ember);
	}

	.text.size-md {
		padding: 12px 18px;
		width: 100%;
		font-size: 15px;
		font-weight: 500;
		text-align: left;
		gap: 12px;
	}

	.text.size-sm {
		padding: 4px 8px;
		font-size: 13px;
		gap: 6px;
	}
</style>
