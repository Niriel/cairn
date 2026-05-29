<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import ButtonPair from '$lib/shared/components/ButtonPair.svelte';
	import { deleteList, refreshLists } from '$lib/list/state/lists.svelte';
	import { pgPatch } from '$lib/shared/http/postgrest';
	import { profile } from '$lib/shared/state/profile.svelte';
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
	let confirmingLeave = $state(false);

	async function handleDelete() {
		await deleteList(listId);
		history.back();
		onDelete();
	}

	async function goManageMembers() {
		onclose(); // unmounts sheet → Sheet.$effect cleanup → history.back()
		await tick();
		// Sheet always calls pushHistoryGuard on mount, so unmounting it always
		// fires popstate. Wait for it before navigating forward, otherwise
		// SvelteKit sees the backward pop after the forward push and undoes it.
		await new Promise<void>((r) => window.addEventListener('popstate', () => r(), { once: true }));
		await goto(resolve(`/lists/${listId}/members`));
	}

	async function handleLeave() {
		const me = profile.uid;
		if (!me) return;
		const now = new Date().toISOString();
		await pgPatch<void>(`/list_members?list_id=eq.${listId}&user_id=eq.${me}`, {
			deleted_at: now
		});
		// Drop the just-left list from the cached lists.items so /lists
		// doesn't keep showing it after navigation.
		refreshLists();
		await goto(resolve('/lists'));
		onclose();
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
	<button class="row" data-test="list-overflow-manage-members" onclick={goManageMembers}>
		<Icon name="users" size={18} />
		<span class="label">Manage members</span>
	</button>
	<button class="row" data-test="list-overflow-view-trash" onclick={onviewtrash}>
		<Icon name="trash-2" size={18} />
		<span class="label">View bin</span>
	</button>
	{#if confirmingLeave}
		<div class="confirm">
			<p class="confirm-copy">
				Leave {listName}? You'll have to be re-invited to rejoin.
			</p>
			<ButtonPair>
				{#snippet left()}
					<button class="confirm-cancel" onclick={() => (confirmingLeave = false)}>Cancel</button>
				{/snippet}
				{#snippet right()}
					<button
						class="confirm-leave"
						data-test="list-overflow-leave-confirm"
						onclick={() => void handleLeave()}>Leave</button
					>
				{/snippet}
			</ButtonPair>
		</div>
	{:else}
		<button class="row" data-test="list-overflow-leave" onclick={() => (confirmingLeave = true)}>
			<Icon name="log-out" size={18} />
			<span class="label">Leave list</span>
		</button>
	{/if}
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

	.confirm {
		padding: 14px 22px;
		border-bottom: 1px solid var(--rule);
	}

	.confirm-copy {
		margin: 0 0 10px;
		font-size: 13.5px;
		color: var(--ink);
		line-height: 1.4;
	}

	.confirm-cancel,
	.confirm-leave {
		padding: 8px 14px;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
	}

	.confirm-cancel {
		border: 1px solid var(--rule);
		background: transparent;
		color: var(--stone);
	}

	.confirm-leave {
		border: none;
		background: var(--ember);
		color: #fff;
	}
</style>
