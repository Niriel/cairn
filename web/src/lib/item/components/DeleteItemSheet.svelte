<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import { softDeleteItem } from '$lib/item/state/items.svelte';
	import type { Item } from '$lib/item/model/item';

	type Props = {
		item: Item;
		memberCount: number;
		ondelete: () => void;
		oncancel: () => void;
	};

	let { item, memberCount, ondelete, oncancel }: Props = $props();

	let deleting = $state(false);

	async function handleDelete() {
		deleting = true;
		try {
			await softDeleteItem(item.id);
			ondelete();
		} finally {
			deleting = false;
		}
	}

	const bodyText = $derived(
		memberCount > 1
			? "Other members will no longer see this item. You can restore it from this list's trash."
			: "No other members can see this item. You can restore it from this list's trash."
	);
</script>

<Sheet open={true} onclose={oncancel}>
	<div class="confirm-row">
		<div class="icon-wrap">
			<Icon name="trash" size={18} />
		</div>
		<div class="text">
			<h2 class="heading t-sheet" data-test="delete-heading">Delete "{item.name}"?</h2>
			<p class="body">{bodyText}</p>
		</div>
	</div>
	<div class="actions">
		<Button type="button" tone="ink" data-test="delete-cancel" onclick={oncancel}>Cancel</Button>
		<Button
			type="button"
			tone="destructive"
			data-test="delete-confirm"
			disabled={deleting}
			onclick={() => void handleDelete()}>Delete</Button
		>
	</div>
</Sheet>

<style>
	.confirm-row {
		display: flex;
		gap: 0.875rem;
		align-items: flex-start;
		margin-bottom: 1rem;
	}

	/* Layout-bearing icon wrapper: a 40px ember disc holding the trash glyph. Its
	   ember tint/colour is part of the affordance, not strippable drift — an
	   annotated exception to the layout-only rule. */
	.icon-wrap {
		width: 40px;
		height: 40px;
		border-radius: 0.75rem;
		background: var(--ember-bg);
		color: var(--ember);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.body {
		margin-top: 0.375rem;
	}

	.actions {
		display: flex;
		gap: 0.625rem;
	}

	.actions :global(button) {
		flex: 1;
	}
</style>
