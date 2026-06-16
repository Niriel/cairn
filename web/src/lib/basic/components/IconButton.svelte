<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	import { ICON_SIZE } from '$lib/shared/model/constants';
	import type { IconName } from '../model/icon-paths';
	import Icon from './Icon.svelte';

	type Props = HTMLButtonAttributes & {
		/* Pass `icon` for the common case and the button renders the standard
		   ICON_SIZE glyph itself; fall back to `children` for anything bespoke. */
		icon?: IconName;
		children?: Snippet;
	};

	let { icon, children, ...rest }: Props = $props();
</script>

<button class="icon-btn" {...rest}>
	{#if icon}<Icon name={icon} size={ICON_SIZE} />{:else}{@render children?.()}{/if}
</button>

<style>
	.icon-btn {
		background: none;
		border: none;
		padding: 4px;
		min-width: var(--tap-target);
		min-height: var(--tap-target);
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
