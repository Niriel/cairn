<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import { addItem, editItem } from '$lib/item/state/items.svelte';
	import type { Item } from '$lib/item/model/item';

	type Props = {
		mode: 'add' | 'edit';
		listId: string;
		listName: string;
		item?: Item;
		onsubmit: () => void;
		oncancel: () => void;
	};

	let { mode, listId, listName, item, onsubmit, oncancel }: Props = $props();

	// $derived so the form re-populates if `item` prop is swapped (e.g. open
	// different item while sheet is mounted). The user's edits are tracked via
	// the bound input values; these derived values only set the initial render.
	const initialName = $derived(item?.name ?? '');
	const initialNotes = $derived(item?.notes ?? '');

	let name = $state('');
	let notes = $state('');

	$effect(() => {
		name = initialName;
		notes = initialNotes;
	});
	let submitting = $state(false);

	async function handleSubmit() {
		submitting = true;
		try {
			if (mode === 'add') {
				await addItem(listId, name, notes || undefined);
			} else {
				await editItem(item!.id, name, notes);
			}
			onsubmit();
		} finally {
			submitting = false;
		}
	}
</script>

<Sheet open={true} onclose={oncancel}>
	<div class="sheet-header">
		<div>
			<div class="title">{mode === 'add' ? 'New item' : 'Edit item'}</div>
			<div class="sub">in {listName}</div>
		</div>
		<button type="button" class="cancel-btn" onclick={oncancel} aria-label="Cancel">×</button>
	</div>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			void handleSubmit();
		}}
	>
		<label class="field-label" for="add-edit-name-input">Name</label>
		<input
			id="add-edit-name-input"
			data-test="add-edit-name"
			type="text"
			bind:value={name}
			required
			placeholder="Name"
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					e.preventDefault();
					oncancel();
				}
			}}
		/>

		<label class="field-label" for="add-edit-notes-input">
			Notes <span class="optional">· optional</span>
		</label>
		<textarea
			id="add-edit-notes-input"
			data-test="add-edit-notes"
			bind:value={notes}
			placeholder="Notes (optional)"
			onkeydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey && !submitting) {
					e.preventDefault();
					void handleSubmit();
				} else if (e.key === 'Escape') {
					e.preventDefault();
					oncancel();
				}
			}}
		></textarea>

		<div class="actions">
			<Button type="button" tone="ink" data-test="add-edit-cancel" onclick={oncancel}>Cancel</Button
			>
			<Button type="submit" tone="primary" data-test="add-edit-submit" disabled={submitting}
				>{mode === 'add' ? 'Add' : 'Save'}</Button
			>
		</div>
	</form>
</Sheet>

<style>
	.sheet-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 18px;
	}

	.title {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 19px;
		font-weight: 500;
		color: var(--ink);
	}

	.sub {
		font-size: 12px;
		color: var(--stone);
		margin-top: 2px;
	}

	.cancel-btn {
		background: none;
		border: none;
		font-size: 20px;
		color: var(--ink-soft);
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--stone);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin-top: 12px;
	}

	.optional {
		font-weight: 400;
		text-transform: none;
		color: var(--stone-lt, var(--stone));
	}

	input,
	textarea {
		width: 100%;
		padding: 12px 14px;
		border: 1px solid var(--rule);
		border-radius: 12px;
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		font-size: 16px;
		box-sizing: border-box;
	}

	textarea {
		min-height: 88px;
		resize: none;
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 14px;
	}

	input:focus,
	textarea:focus {
		outline: none;
		border-color: var(--ink);
	}

	.actions {
		display: flex;
		gap: 10px;
		margin-top: 18px;
	}

	.actions :global(button) {
		flex: 1;
	}
</style>
