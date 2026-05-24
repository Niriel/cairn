<script lang="ts">
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
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
	<div class="content">
		<div class="icon-wrap">
			<Icon name="trash" size={18} />
		</div>
		<div class="text">
			<div class="heading" data-test="delete-heading">Delete "{item.name}"?</div>
			<div class="body">{bodyText}</div>
		</div>
	</div>
	<div class="actions">
		<button type="button" class="btn-cancel" data-test="delete-cancel" onclick={oncancel}
			>Cancel</button
		>
		<button
			type="button"
			class="btn-delete"
			data-test="delete-confirm"
			disabled={deleting}
			onclick={() => void handleDelete()}>Delete</button
		>
	</div>
</Sheet>

<style>
	.content {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		margin-bottom: 16px;
	}

	.icon-wrap {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: var(--ember-bg, #fef2f2);
		color: var(--ember);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.heading {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 19px;
		font-weight: 500;
		color: var(--ink);
		letter-spacing: -0.005em;
	}

	.body {
		margin-top: 6px;
		font-size: 13px;
		color: var(--ink-soft);
		line-height: 1.5;
	}

	.actions {
		display: flex;
		gap: 10px;
	}

	.btn-cancel,
	.btn-delete {
		flex: 1;
		padding: 12px;
		border-radius: 12px;
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}

	.btn-cancel {
		border: 1px solid var(--rule);
		background: var(--paper);
		color: var(--ink);
	}

	.btn-delete {
		border: none;
		background: var(--ember);
		color: #fff;
		font-weight: 600;
	}

	.btn-delete:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
