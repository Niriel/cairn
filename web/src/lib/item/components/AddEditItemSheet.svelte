<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import Label from '$lib/basic/components/Label.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import Textarea from '$lib/basic/components/Textarea.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';
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
		<header>
			<h2 class="title t-sheet">{mode === 'add' ? 'New item' : 'Edit item'}</h2>
			<p class="sub caption">in {listName}</p>
		</header>
		<button type="button" class="cancel-btn" onclick={oncancel} aria-label="Cancel">×</button>
	</div>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			void handleSubmit();
		}}
	>
		<div class="field">
			<Label for="add-edit-name-input">Name</Label>
			<TextInput
				id="add-edit-name-input"
				data-test="add-edit-name"
				bind:value={name}
				required
				placeholder="Name"
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Escape') {
						e.preventDefault();
						oncancel();
					}
				}}
			/>
		</div>

		<div class="field notes-field">
			<Label for="add-edit-notes-input">
				Notes <span class="optional">· optional</span>
			</Label>
			<Textarea
				id="add-edit-notes-input"
				data-test="add-edit-notes"
				bind:value={notes}
				minHeight="88px"
				placeholder="Notes (optional)"
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Enter' && !e.shiftKey && !submitting) {
						e.preventDefault();
						void handleSubmit();
					} else if (e.key === 'Escape') {
						e.preventDefault();
						oncancel();
					}
				}}
			/>
		</div>

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
		margin-bottom: 1.125rem;
	}

	.sub {
		margin-top: 0.125rem;
	}

	.cancel-btn {
		background: none;
		border: none;
		font-size: 1.25rem;
		color: var(--ink-soft);
		cursor: pointer;
		padding: 0 0.25rem;
		line-height: 1;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1.125rem;
	}

	/* The notes textarea is editorial serif copy — an annotated exception to the
	   layout-only rule (it is body content the user is composing). */
	.notes-field :global(textarea) {
		font-family: 'Newsreader Variable', Georgia, serif;
	}

	/* "· optional" recedes against the bold form label — a per-label weight/colour
	   override, not drift. */
	.optional {
		font-weight: 400;
		text-transform: none;
		color: var(--stone);
	}

	.actions {
		display: flex;
		gap: 0.625rem;
		margin-top: 1.125rem;
	}

	.actions :global(button) {
		flex: 1;
	}
</style>
