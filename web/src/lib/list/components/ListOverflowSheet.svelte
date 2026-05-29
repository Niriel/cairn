<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';
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
		// Snapshot listId — onclose() nulls the parent's overflowList, after
		// which the listId prop getter would throw on null.id.
		const id = listId;
		onclose(); // unmounts sheet → Sheet.$effect cleanup → history.back()
		await tick();
		// Sheet always calls pushHistoryGuard on mount, so unmounting it always
		// fires popstate. Wait for it before navigating forward, otherwise
		// SvelteKit sees the backward pop after the forward push and undoes it.
		await new Promise<void>((r) => window.addEventListener('popstate', () => r(), { once: true }));
		await goto(resolve(`/lists/${id}/members`));
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
	<div class="rows">
		<Button
			variant="text"
			tone="ink"
			size="md"
			data-test="list-overflow-rename"
			onclick={() => (showRename = true)}
		>
			<Icon name="pencil" size={18} />
			<span class="label">Rename list</span>
		</Button>
		<hr />
		<Button
			variant="text"
			tone="ink"
			size="md"
			data-test="list-overflow-edit-description"
			onclick={() => (showEditDescription = true)}
		>
			<Icon name="feather" size={18} />
			<span class="label">Edit description</span>
		</Button>
		<hr />
		<Button
			variant="text"
			tone="ink"
			size="md"
			data-test="list-overflow-manage-members"
			onclick={goManageMembers}
		>
			<Icon name="users" size={18} />
			<span class="label">Manage members</span>
		</Button>
		<hr />
		<Button
			variant="text"
			tone="ink"
			size="md"
			data-test="list-overflow-view-trash"
			onclick={onviewtrash}
		>
			<Icon name="trash-2" size={18} />
			<span class="label">View bin</span>
		</Button>
		<hr />
		{#if confirmingLeave}
			<div class="confirm">
				<p class="confirm-copy">
					Leave {listName}? You'll have to be re-invited to rejoin.
				</p>
				<ButtonPair>
					{#snippet left()}
						<Button variant="rect" tone="ink" size="md" onclick={() => (confirmingLeave = false)}
							>Cancel</Button
						>
					{/snippet}
					{#snippet right()}
						<Button
							variant="rect"
							tone="destructive"
							size="sm"
							data-test="list-overflow-leave-confirm"
							onclick={() => void handleLeave()}>Leave</Button
						>
					{/snippet}
				</ButtonPair>
			</div>
		{:else}
			<Button
				variant="text"
				tone="ink"
				size="md"
				data-test="list-overflow-leave"
				onclick={() => (confirmingLeave = true)}
			>
				<Icon name="log-out" size={18} />
				<span class="label">Leave list</span>
			</Button>
		{/if}
		<hr />
		<Button
			variant="text"
			tone="destructive"
			size="md"
			data-test="list-overflow-delete"
			onclick={() => void handleDelete()}
		>
			<Icon name="trash" size={18} />
			<span class="label">Delete list</span>
		</Button>
	</div>
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

	.rows :global(button) {
		padding: 14px 22px;
		gap: 14px;
	}

	.label {
		font-size: 15px;
		font-weight: 500;
	}

	.confirm {
		padding: 14px 22px;
	}

	.confirm-copy {
		margin: 0 0 10px;
		font-size: 13.5px;
		color: var(--ink);
		line-height: 1.4;
	}
</style>
