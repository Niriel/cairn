<script lang="ts">
	import type { Snippet } from 'svelte';

	import type { IconName } from '../model/icon-paths';
	import Icon from './Icon.svelte';

	type Variant = 'rect' | 'pill' | 'text' | 'link';
	type Tone = 'primary' | 'ink' | 'destructive' | 'sage';
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
		style?: string;
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

	function handleClick() {
		if (disabled) return;
		onclick?.();
	}
</script>

<button
	class:rect={variant === 'rect'}
	class:pill={variant === 'pill'}
	class:text={variant === 'text'}
	class:link={variant === 'link'}
	class:tone-primary={tone === 'primary'}
	class:tone-ink={tone === 'ink'}
	class:tone-destructive={tone === 'destructive'}
	class:tone-sage={tone === 'sage'}
	class:size-md={size === 'md'}
	class:size-sm={size === 'sm'}
	{disabled}
	{type}
	onclick={handleClick}
	{...rest}
>
	{#if leadingIcon}
		<!-- 1em: the glyph tracks the (rem-based) label size, so it scales with
		     the Settings text-size control. -->
		<Icon name={leadingIcon} size="1em" />
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
		border-radius: 0.75rem;
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

	.rect.tone-sage {
		background: var(--sage);
		color: var(--paper);
	}

	/* Size tiers track the type scale: md is the 1rem body floor, sm is the
	   0.8rem "small print" tier (the .fine role). Both rem, so buttons scale
	   with the Settings text-size control. */
	.rect.size-md {
		padding: 0.75rem 1.25rem;
		font-size: 1rem;
	}

	.rect.size-sm {
		padding: 0.5rem 0.875rem;
		font-size: 0.8rem;
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

	/* sage is the single affirmative "go" action — filled, unlike every other
	   pill tone (which stay outlined). */
	.pill.tone-sage {
		background: var(--sage);
		color: var(--paper);
		border: none;
	}

	.pill.size-sm {
		padding: 0.4375rem 0.875rem;
		font-size: 0.8rem;
		gap: 0.375rem;
	}

	.pill.size-md {
		padding: 0.625rem 1.125rem;
		font-size: 1rem;
		gap: 0.375rem;
	}

	/* text variant */
	.text {
		background: transparent;
		border: none;
		justify-content: flex-start;
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

	.text.tone-sage {
		color: var(--sage);
	}

	.text.size-md {
		padding: 0.75rem 1.125rem;
		width: 100%;
		font-size: 1rem;
		font-weight: 500;
		text-align: left;
		gap: 0.75rem;
	}

	.text.size-sm {
		padding: 0.25rem 0.5rem;
		font-size: 0.8rem;
		gap: 0.375rem;
	}

	/* link variant — inherits font-size from context */
	.link {
		background: transparent;
		border: none;
		padding: 0;
		color: var(--accent);
		font-weight: 600;
		gap: 0.375rem;
	}
</style>
