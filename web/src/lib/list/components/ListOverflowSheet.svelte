<script lang="ts">
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import { deleteList } from '$lib/list/state/lists.svelte';
	import RenameListSheet from './RenameListSheet.svelte';
	import EditDescriptionSheet from './EditDescriptionSheet.svelte';

	type Props = {
		listId: string;
		listName: string;
		description: string | null;
		itemCount: number;
		memberCount: number;
		onDelete: () => void;
		onviewtrash: () => void;
		onclose: () => void;
	};

	let {
		listId,
		listName,
		description,
		itemCount,
		memberCount,
		onDelete,
		onviewtrash,
		onclose
	}: Props = $props();

	let showRename = $state(false);
	let showEditDescription = $state(false);

	async function handleDelete() {
		await deleteList(listId);
		history.back();
		onDelete();
	}

	const meta = $derived(
		`${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${memberCount} ${memberCount === 1 ? 'member' : 'members'}`
	);
</script>

<Sheet open={true} {onclose}>
	<div class="handle"></div>
	<div class="header">
		<div class="list-name">{listName}</div>
		<div class="meta">{meta}</div>
	</div>
	<button class="row" data-test="list-overflow-rename" onclick={() => (showRename = true)}>
		<Icon name="pencil" size={18} />
		<span class="label">Rename list</span>
	</button>
	<button
		class="row"
		data-test="list-overflow-edit-description"
		onclick={() => (showEditDescription = true)}
	>
		<Icon name="feather" size={18} />
		<span class="label">Edit description</span>
	</button>
	<button class="row" data-test="list-overflow-view-trash" onclick={onviewtrash}>
		<Icon name="trash-2" size={18} />
		<span class="label">View bin</span>
	</button>
	<button
		class="row row-delete"
		data-test="list-overflow-delete"
		onclick={() => void handleDelete()}
	>
		<Icon name="trash" size={18} />
		<span class="label">Delete list</span>
	</button>
</Sheet>

{#if showRename}
	<RenameListSheet {listId} currentName={listName} onclose={() => (showRename = false)} />
{/if}

{#if showEditDescription}
	<EditDescriptionSheet
		{listId}
		currentDescription={description}
		onclose={() => (showEditDescription = false)}
	/>
{/if}

<style>
	.handle {
		width: 36px;
		height: 4px;
		border-radius: 99px;
		background: var(--stone-lt);
		margin: 0 auto 14px;
	}

	.header {
		padding: 0 22px 14px;
		border-bottom: 1px solid var(--rule);
	}

	.list-name {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 18px;
		font-weight: 500;
		color: var(--ink);
	}

	.meta {
		font-size: 12px;
		color: var(--stone);
		margin-top: 2px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 22px;
		border-bottom: 1px solid var(--rule);
		width: 100%;
		background: none;
		border-left: none;
		border-right: none;
		border-top: none;
		text-align: left;
		cursor: pointer;
		color: var(--ink);
		font: inherit;
	}

	.row:last-of-type {
		border-bottom: none;
	}

	.row-delete {
		color: var(--ember);
	}

	.label {
		font-size: 15px;
		font-weight: 500;
	}
</style>
