<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { pgGet } from '$lib/shared/http/postgrest';
	import { pushHistoryGuard } from '$lib/shared/state/back-stack.svelte';
	import {
		items,
		loadItems,
		upsertVote,
		deleteVote,
		undoDelete
	} from '$lib/item/state/items.svelte';
	import type { Item } from '$lib/item/model/item';
	import { timeAgo } from '$lib/shared/model/time-ago';
	import { TOMBSTONE_UID } from '$lib/shared/model/constants';

	import TopBar from '$lib/shared/components/TopBar.svelte';
	import Button from '$lib/basic/components/Button.svelte';
	import IconButton from '$lib/basic/components/IconButton.svelte';
	import MoreButton from '$lib/shared/components/MoreButton.svelte';
	import UndoSnackbar from '$lib/shared/components/UndoSnackbar.svelte';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import Fab from '$lib/basic/components/Fab.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import VoteControl from './VoteControl.svelte';
	import AddEditItemSheet from './AddEditItemSheet.svelte';
	import DeleteItemSheet from './DeleteItemSheet.svelte';
	import ListOverflowSheet from '$lib/list/components/ListOverflowSheet.svelte';

	type ListMeta = { name: string; description: string | null; list_members: { user_id: string }[] };

	type Props = { listId: string };
	let { listId }: Props = $props();

	let listMeta = $state<ListMeta>({ name: '', description: null, list_members: [] });
	let overflowOpen = $state(false);
	let openId = $state<string | null>(null);
	let addSheetOpen = $state(false);
	let editSheetItem = $state<Item | null>(null);
	let deleteSheetItem = $state<Item | null>(null);

	async function reloadMeta() {
		await pgGet<ListMeta[]>(
			`/lists?id=eq.${listId}&select=name,description,list_members(user_id)&list_members.deleted_at=is.null`
		)
			.then((rows) => {
				if (rows.length > 0) listMeta = rows[0];
			})
			.catch(() => {});
	}

	function refreshItems() {
		void loadItems(listId);
		void reloadMeta();
	}

	let loadedFor: string | undefined;
	$effect(() => {
		if (loadedFor === listId) return;
		loadedFor = listId;
		void loadItems(listId);
		void reloadMeta();
	});

	const isOpen = $derived(openId !== null);

	$effect(() => {
		if (!isOpen) return;
		return pushHistoryGuard(() => {
			openId = null;
		});
	});

	function toggleRow(id: string) {
		openId = openId === id ? null : id;
	}

	function handleVote(itemId: string, v: number | null) {
		if (v === null) void deleteVote(itemId);
		else void upsertVote(itemId, v);
	}
</script>

<div class="screen">
	<TopBar
		showBack={true}
		sub="{items.rows.length} items · {listMeta.list_members.length} {listMeta.list_members
			.length === 1
			? 'member'
			: 'members'}"
	>
		{listMeta.name}
		{#snippet right()}
			<IconButton
				aria-label="Refresh"
				data-test="items-refresh"
				disabled={items.loading}
				onclick={refreshItems}
			>
				<Icon name="rotate-ccw" size={22} />
			</IconButton>
			<MoreButton aria-label="More options" size={22} onclick={() => (overflowOpen = true)} />
		{/snippet}
	</TopBar>

	{#if items.loading}
		<div class="content loading" data-test="items-loading">Loading…</div>
	{:else if items.rows.length === 0}
		<div class="content empty" data-test="items-empty">
			<div class="empty-circle">
				<Icon name="feather" size={32} />
			</div>
			<div class="empty-heading">Nothing here yet</div>
			<p class="empty-body">
				Drop the first stone — add an item with a name and (optionally) a note.
			</p>
			<Button
				variant="rect"
				tone="ink"
				size="md"
				leadingIcon="plus"
				onclick={() => (addSheetOpen = true)}
			>
				Add the first item
			</Button>
		</div>
	{:else}
		<div class="rows">
			{#each items.rows as item (item.id)}
				<div class="row" class:open={openId === item.id}>
					<div class="row-inner">
						<button class="row-tap" data-test="row-{item.id}" onclick={() => toggleRow(item.id)}>
							<span class="item-name">{item.name}</span>
							{#if item.score !== 0}
								<span
									class="score-badge"
									class:positive={item.score > 0}
									class:negative={item.score < 0}
								>
									{item.score > 0 ? '+' : ''}{item.score}
								</span>
							{/if}
						</button>
						<VoteControl
							value={item.my_vote}
							onchange={(v: number | null) => handleVote(item.id, v)}
						/>
					</div>
					{#if openId === item.id}
						<div data-test="item-panel" class="item-panel">
							{#if item.notes}
								<div class="notes">{item.notes}</div>
							{/if}
							{#if item.member_votes.length > 0}
								<div class="member-votes">
									{#each item.member_votes as mv (mv.user_id)}
										<span class="member-vote">
											<Avatar
												displayName={mv.display_name}
												size={18}
												uid={mv.user_id}
												avatarVersion={mv.avatar_version}
											/>
											<span class="mv-name">{mv.display_name}</span>
											<span
												class="mv-val"
												class:positive={mv.value > 0}
												class:negative={mv.value < 0}
											>
												{mv.value > 0 ? '+' : ''}{mv.value}
											</span>
										</span>
									{/each}
								</div>
							{/if}
							<div class="attribution">
								Added by <strong
									data-test="attribution-creator-{item.id}"
									class:tombstone={item.created_by === TOMBSTONE_UID}>{item.created_by_name}</strong
								>
								{timeAgo(item.created_at)}.
								{#if item.modified_by_name}
									Last edited by <strong
										data-test="attribution-editor-{item.id}"
										class:tombstone={item.modified_by === TOMBSTONE_UID}
										>{item.modified_by_name}</strong
									>
									{timeAgo(item.modified_at)}.
								{/if}
							</div>
							<div class="panel-actions">
								<Button
									variant="pill"
									tone="destructive"
									size="sm"
									leadingIcon="trash"
									data-test="panel-delete-{item.id}"
									style="flex: 1"
									onclick={() => {
										deleteSheetItem = item;
										openId = null;
									}}>Delete</Button
								>
								<Button
									variant="pill"
									tone="ink"
									size="sm"
									leadingIcon="pencil"
									data-test="panel-edit-{item.id}"
									style="flex: 1"
									onclick={() => {
										editSheetItem = item;
										openId = null;
									}}>Edit</Button
								>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	{#if !items.pendingDelete}
		<Fab onclick={() => (addSheetOpen = true)} aria-label="Add item" data-test="items-fab">
			<Icon name="plus" size={22} />
		</Fab>
	{/if}

	{#if items.pendingDelete}
		{#if items.error}
			<div class="undo-snackbar" data-test="undo-snackbar">
				<Icon name="trash-2" size={16} />
				<span class="snackbar-text">Undo failed — find it in the bin.</span>
			</div>
		{:else}
			<UndoSnackbar
				deletedName={items.pendingDelete.item.name}
				onUndo={() => void undoDelete()}
				ondismiss={() => {
					items.pendingDelete = null;
				}}
				data-test="undo-snackbar"
			/>
		{/if}
	{/if}

	{#if addSheetOpen}
		<AddEditItemSheet
			mode="add"
			{listId}
			listName={listMeta.name}
			onsubmit={() => (addSheetOpen = false)}
			oncancel={() => (addSheetOpen = false)}
		/>
	{/if}

	{#if editSheetItem}
		<AddEditItemSheet
			mode="edit"
			{listId}
			listName={listMeta.name}
			item={editSheetItem}
			onsubmit={() => (editSheetItem = null)}
			oncancel={() => (editSheetItem = null)}
		/>
	{/if}

	{#if deleteSheetItem}
		<DeleteItemSheet
			item={deleteSheetItem}
			memberCount={listMeta.list_members.length}
			ondelete={() => (deleteSheetItem = null)}
			oncancel={() => (deleteSheetItem = null)}
		/>
	{/if}
</div>

{#if overflowOpen}
	<ListOverflowSheet
		{listId}
		listName={listMeta.name}
		description={listMeta.description}
		itemCount={items.rows.length}
		memberCount={listMeta.list_members.length}
		onDelete={() => history.back()}
		onclose={() => (overflowOpen = false)}
		onviewtrash={async () => {
			overflowOpen = false; // unmounts sheet → Sheet.$effect cleanup → history.back()
			await tick();
			// Sheet always calls pushHistoryGuard on mount, so unmounting it always
			// fires popstate. Wait for it before navigating forward, otherwise
			// SvelteKit sees the backward pop after the forward push and undoes it.
			await new Promise<void>((r) =>
				window.addEventListener('popstate', () => r(), { once: true })
			);
			await goto(resolve(`/lists/${listId}/trash`));
		}}
	/>
{/if}

<style>
	.screen {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}

	.content {
		flex: 1;
		padding: 16px;
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--stone);
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 36px;
		text-align: center;
	}

	.empty-circle {
		width: 80px;
		height: 80px;
		border-radius: 99px;
		background: var(--paper-alt, var(--paper));
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 22px;
		border: 1px dashed var(--stone);
		color: var(--stone);
	}

	.empty-heading {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 22px;
		font-weight: 500;
		color: var(--ink);
		letter-spacing: -0.01em;
		margin-bottom: 8px;
	}

	.empty-body {
		font-size: 13.5px;
		color: var(--ink-soft);
		line-height: 1.5;
		margin-bottom: 22px;
		max-width: 240px;
		margin-top: 0;
	}

	.rows {
		padding-bottom: 90px;
	}

	.row {
		border-bottom: 1px solid var(--rule);
	}

	.row:last-child {
		border-bottom: none;
	}

	.row.open {
		background: var(--paper-alt, var(--paper));
	}

	.row-inner {
		display: flex;
		align-items: center;
		padding: 14px 18px 14px 20px;
		gap: 10px;
		min-height: 56px;
	}

	.row-tap {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.item-name {
		font-size: 15.5px;
		color: var(--ink);
		line-height: 1.35;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-weight: 500;
	}

	.row.open .item-name {
		font-weight: 600;
	}

	.score-badge {
		font-size: 11px;
		font-weight: 600;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		padding: 2px 6px;
		border-radius: 6px;
		flex-shrink: 0;
	}

	.score-badge.positive {
		color: var(--sage);
		background: var(--sage-bg, #f0fdf4);
	}

	.score-badge.negative {
		color: var(--ember);
		background: var(--ember-bg, #fef2f2);
	}

	.item-panel {
		padding: 4px 22px 18px;
		border-top: 1px dashed var(--rule);
		background: var(--paper-alt, var(--paper));
	}

	.notes {
		margin-top: 14px;
		font-family: 'Newsreader Variable', Georgia, serif;
		font-style: italic;
		font-size: 14px;
		line-height: 1.55;
		color: var(--ink-soft);
	}

	.member-votes {
		margin-top: 14px;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}

	.member-vote {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12.5px;
		color: var(--ink-soft);
	}

	.mv-val {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-weight: 600;
		color: var(--stone);
	}

	.mv-val.positive {
		color: var(--sage);
	}

	.mv-val.negative {
		color: var(--ember);
	}

	.attribution {
		margin-top: 14px;
		font-size: 11.5px;
		color: var(--stone);
		line-height: 1.5;
	}

	.attribution strong {
		color: var(--ink-soft);
		font-weight: 600;
	}

	.attribution strong.tombstone {
		font-style: italic;
		font-weight: normal;
		color: var(--stone-lt);
		font-family: 'Newsreader Variable', Georgia, serif;
	}

	.panel-actions {
		margin-top: 14px;
		display: flex;
		gap: 8px;
	}

	.undo-snackbar {
		position: fixed;
		left: max(0px, calc(50% - var(--app-max-w) / 2 + 12px));
		right: max(0px, calc(50% - var(--app-max-w) / 2 + 12px));
		bottom: calc(env(safe-area-inset-bottom) + 18px);
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 16px;
		background: var(--ink);
		color: var(--paper);
		border-radius: 12px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
		z-index: 200;
	}

	.snackbar-text {
		flex: 1;
		font-size: 13.5px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
</style>
