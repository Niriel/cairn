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
	<div class="sheet-handle"></div>
	<header class="header">
		<h2 class="t-sheet">{listName}</h2>
		<p class="meta caption">{meta}</p>
	</header>
	<ul class="menu">
		<li>
			<Button
				variant="text"
				tone="ink"
				size="md"
				data-test="list-overflow-rename"
				onclick={() => (showRename = true)}
			>
				<Icon name="pencil" size={18} />
				<span class="body">Rename list</span>
			</Button>
		</li>
		<li role="separator" aria-hidden="true"><hr /></li>
		<li>
			<Button
				variant="text"
				tone="ink"
				size="md"
				data-test="list-overflow-edit-description"
				onclick={() => (showEditDescription = true)}
			>
				<Icon name="feather" size={18} />
				<span class="body">Edit description</span>
			</Button>
		</li>
		<li role="separator" aria-hidden="true"><hr /></li>
		<li>
			<Button
				variant="text"
				tone="ink"
				size="md"
				data-test="list-overflow-manage-members"
				onclick={goManageMembers}
			>
				<Icon name="users" size={18} />
				<span class="body">Manage members</span>
			</Button>
		</li>
		<li role="separator" aria-hidden="true"><hr /></li>
		<li>
			<Button
				variant="text"
				tone="ink"
				size="md"
				data-test="list-overflow-view-trash"
				onclick={onviewtrash}
			>
				<Icon name="trash-2" size={18} />
				<span class="body">View bin</span>
			</Button>
		</li>
		<li role="separator" aria-hidden="true"><hr /></li>
		{#if confirmingLeave}
			<li class="confirm">
				<p class="confirm-copy body">
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
			</li>
		{:else}
			<li>
				<Button
					variant="text"
					tone="ink"
					size="md"
					data-test="list-overflow-leave"
					onclick={() => (confirmingLeave = true)}
				>
					<Icon name="log-out" size={18} />
					<span class="body">Leave list</span>
				</Button>
			</li>
		{/if}
		<li role="separator" aria-hidden="true"><hr /></li>
		<li>
			<Button
				variant="text"
				tone="destructive"
				size="md"
				data-test="list-overflow-delete"
				onclick={() => void handleDelete()}
			>
				<Icon name="trash" size={18} />
				<span class="body">Delete list</span>
			</Button>
		</li>
	</ul>
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
	.header {
		padding: 0 1.375rem 0.875rem;
		border-bottom: 1px solid var(--rule);
	}

	.meta {
		margin-top: 0.125rem;
	}

	.menu :global(button) {
		padding: 0.875rem 1.375rem;
		gap: 0.875rem;
	}

	/* Hairline divider between action-menu items. */
	.menu hr {
		margin: 0;
		border: none;
		border-top: 1px solid var(--rule);
	}

	.confirm {
		padding: 0.875rem 1.375rem;
	}

	.confirm-copy {
		margin: 0 0 0.625rem;
	}
</style>
