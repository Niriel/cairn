<script lang="ts">
	import type { Snippet } from 'svelte';

	import type { IconName } from '$lib/basic/model/icon-paths';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';

	type Props = {
		icon?: IconName;
		iconContent?: Snippet;
		iconSize?: number;
		title?: string;
		body?: string;
		ctaLabel?: string;
		onCta?: () => void;
		'data-test'?: string;
	};

	let { icon, iconContent, iconSize = 32, title, body, ctaLabel, onCta, ...rest }: Props = $props();
</script>

<div class="empty" data-test={rest['data-test']}>
	<div class="empty-circle">
		{#if iconContent}
			{@render iconContent()}
		{:else if icon}
			<Icon name={icon} size={iconSize} />
		{/if}
	</div>
	{#if title}<p class="empty-heading">{title}</p>{/if}
	{#if body}<p class="empty-body">{body}</p>{/if}
	{#if ctaLabel && onCta}
		<Button variant="rect" tone="ink" size="md" leadingIcon="plus" onclick={onCta}>
			{ctaLabel}
		</Button>
	{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 36px;
		text-align: center;
	}

	.empty-circle {
		width: 96px;
		height: 96px;
		border-radius: 99px;
		background: var(--paper-alt);
		border: 1px dashed var(--stone-lt);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 24px;
	}

	.empty-heading {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 24px;
		font-weight: 500;
		letter-spacing: -0.01em;
		color: var(--ink);
		margin-bottom: 10px;
	}

	.empty-body {
		font-size: 14px;
		color: var(--ink-soft);
		line-height: 1.5;
		margin: 0 0 28px;
		max-width: 280px;
	}
</style>
