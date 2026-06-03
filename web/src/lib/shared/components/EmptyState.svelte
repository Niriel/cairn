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
	{#if title}<p class="empty-heading t-hero">{title}</p>{/if}
	{#if body}<p class="empty-body body">{body}</p>{/if}
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
		padding: 2.5rem 2.25rem;
		text-align: center;
	}

	/* The disc is the empty-state home: a fixed 96px circle (does not scale with
	   text) with a hairline dashed border. */
	.empty-circle {
		width: 96px;
		height: 96px;
		border-radius: 99px;
		background: var(--paper-alt);
		border: 1px dashed var(--stone-lt);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1.5rem;
	}

	/* Type comes from the .t-hero / .body roles; only spacing is local. */
	.empty-heading {
		margin-bottom: 0.625rem;
	}

	.empty-body {
		margin: 0 0 1.75rem;
		max-width: 17.5rem;
	}
</style>
