<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import CairnGlyph from '$lib/shared/components/CairnGlyph.svelte';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import IconButton from '$lib/basic/components/IconButton.svelte';
	import Fab from '$lib/basic/components/Fab.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import MoreButton from '$lib/shared/components/MoreButton.svelte';
	import UndoSnackbar from '$lib/shared/components/UndoSnackbar.svelte';
	import { lists, refreshLists, undoDeleteList } from '$lib/list/state/lists.svelte';
	import { timeAgo } from '$lib/shared/model/time-ago';
	import type { List } from '$lib/list/model/list';

	import InvitesBanner from '$lib/invite/components/InvitesBanner.svelte';
	import CreateListSheet from './CreateListSheet.svelte';
	import ListOverflowSheet from './ListOverflowSheet.svelte';

	let createSheetOpen = $state(false);
	let overflowList = $state<List | null>(null);
	const expandedIds = new SvelteSet<string>();
	const descTextEls = $state<Record<string, HTMLElement>>({});
	const truncatedIds = new SvelteSet<string>();

	$effect(() => {
		void lists.items; // reactive dependency — re-run when list reloads
		truncatedIds.clear();
		for (const [id, el] of Object.entries(descTextEls)) {
			if (el && el.scrollWidth > el.offsetWidth) truncatedIds.add(id);
		}
	});

	function toggleDesc(id: string) {
		if (expandedIds.has(id)) expandedIds.delete(id);
		else expandedIds.add(id);
	}
</script>

<div class="screen">
	<AppTopBar showBack={false}>
		{#snippet left()}
			<CairnGlyph size={40} color="var(--accent)" />
		{/snippet}
		Cairn
		{#snippet right()}
			<IconButton
				aria-label="Refresh"
				data-test="lists-refresh"
				disabled={lists.loading}
				onclick={() => refreshLists()}
			>
				<Icon name="rotate-ccw" size={22} />
			</IconButton>
			<IconButton
				aria-label="Settings"
				data-test="lists-settings"
				onclick={() => goto(resolve('/settings'))}
			>
				<Icon name="settings" size={22} />
			</IconButton>
		{/snippet}
	</AppTopBar>

	<InvitesBanner />

	{#if lists.loading}
		<div class="content" data-test="lists-loading">Loading…</div>
	{:else if lists.items.length === 0}
		<div class="content empty" data-test="lists-empty">
			<div class="empty-circle">
				<CairnGlyph size={44} color="var(--stone)" />
			</div>
			<div class="empty-heading">Start your first cairn</div>
			<p class="empty-body">
				A cairn is a small stack of stones hikers leave to mark the way. Make a list of things —
				movies, books, places — and share it with friends.
			</p>
			<button
				class="empty-cta"
				data-test="lists-empty-cta"
				onclick={() => {
					createSheetOpen = true;
				}}
			>
				<Icon name="plus" size={16} />
				Create your first list
			</button>
		</div>
	{:else}
		<div class="list">
			{#each lists.items as item, i (item.id)}
				<div class="row" class:last={i === lists.items.length - 1} data-test="list-row-{item.id}">
					<div class="row-top">
						<button
							class="row-nav"
							data-test="list-nav-{item.id}"
							onclick={() => {
								void goto(resolve(`/lists/${item.id}`));
							}}
						>
							<span class="name">{item.name}</span>
						</button>
						<MoreButton
							size={18}
							aria-label="List options"
							data-test="list-overflow-{item.id}"
							onclick={() => (overflowList = item)}
							style="color: var(--stone)"
						/>
					</div>
					{#if item.description !== null}
						<button
							class="desc"
							class:expanded={expandedIds.has(item.id)}
							data-test="list-desc-{item.id}"
							onclick={() => toggleDesc(item.id)}
						>
							<span class="desc-text" bind:this={descTextEls[item.id]}>{item.description}</span>
							{#if expandedIds.has(item.id)}
								<span class="see-toggle">(see less)</span>
							{:else if truncatedIds.has(item.id)}
								<span class="see-toggle">(see more)</span>
							{/if}
						</button>
					{:else}
						<div class="desc no-desc" data-test="list-desc-{item.id}">(no description)</div>
					{/if}
					<div class="meta">
						<span>{item.item_count} {item.item_count === 1 ? 'item' : 'items'}</span>
						<span class="dot">•</span>
						<span>{timeAgo(item.modified_at)}</span>
						{#if item.list_members.length > 0}
							<span class="dot">•</span>
							<span class="avatars">
								{#each item.list_members as m, i (m.user_id + i)}
									<span style="margin-left: {i === 0 ? 0 : -6}px">
										<Avatar
											displayName={m.profiles.display_name}
											size={16}
											uid={m.user_id}
											avatarVersion={m.profiles.avatar_version}
										/>
									</span>
								{/each}
							</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if !lists.pendingDelete}
	<Fab
		data-test="lists-fab"
		onclick={() => {
			createSheetOpen = true;
		}}><Icon name="plus" size={24} /></Fab
	>
{/if}

{#if createSheetOpen}
	<CreateListSheet
		open={createSheetOpen}
		onclose={() => {
			createSheetOpen = false;
		}}
		oncreated={() => {
			refreshLists();
		}}
	/>
{/if}

{#if overflowList}
	<ListOverflowSheet
		listId={overflowList.id}
		listName={overflowList.name}
		description={overflowList.description}
		itemCount={overflowList.item_count}
		memberCount={overflowList.list_members.length}
		onDelete={() => {}}
		onclose={() => (overflowList = null)}
		onviewtrash={async () => {
			const trashListId = overflowList!.id;
			overflowList = null; // unmounts sheet → Sheet.$effect cleanup → history.back()
			await tick();
			// Sheet always calls pushHistoryGuard on mount, so unmounting it always
			// fires popstate. Wait for it before navigating forward, otherwise
			// SvelteKit sees the backward pop after the forward push and undoes the navigation.
			await new Promise<void>((r) =>
				window.addEventListener('popstate', () => r(), { once: true })
			);
			await goto(resolve(`/lists/${trashListId}/trash`));
		}}
	/>
{/if}

{#if lists.pendingDelete}
	<UndoSnackbar
		deletedName={lists.pendingDelete.list.name}
		onUndo={() => void undoDeleteList()}
		ondismiss={() => {
			lists.pendingDelete = null;
		}}
		data-test="list-undo-snackbar"
	/>
{/if}

<style>
	.screen {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	.content {
		flex: 1;
	}

	/* ── List rows ── */

	.list {
		padding-top: 6px;
	}

	.row {
		padding: 14px 18px;
		border-bottom: 1px solid var(--rule);
	}

	.row.last {
		border-bottom: none;
	}

	.row-top {
		display: flex;
		align-items: center;
	}

	.row-nav {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
	}

	.name {
		flex: 1;
		min-width: 0;
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 17px;
		font-weight: 600;
		letter-spacing: -0.005em;
		color: var(--ink);
		line-height: 1.3;
	}

	.desc {
		display: flex;
		align-items: baseline;
		gap: 4px;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		font: inherit;
		margin-top: 4px;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--ink-soft);
	}

	.desc-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.desc.expanded .desc-text {
		white-space: normal;
		overflow: visible;
		text-overflow: unset;
	}

	.see-toggle {
		flex-shrink: 0;
		white-space: nowrap;
		font-size: 11.5px;
		color: var(--stone);
	}

	.desc.no-desc {
		cursor: default;
		color: var(--stone);
		font-style: italic;
	}

	.meta {
		margin-top: 6px;
		font-size: 11.5px;
		color: var(--stone);
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.dot {
		color: var(--stone-lt);
	}

	.avatars {
		display: inline-flex;
		align-items: center;
	}

	/* ── Empty state ── */

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 36px;
		text-align: center;
	}

	.empty-circle {
		width: 96px;
		height: 96px;
		border-radius: 99px;
		background: var(--paper-alt);
		border: 1px dashed var(--stone-lt);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 24px;
	}

	.empty-heading {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 24px;
		font-weight: 500;
		letter-spacing: -0.01em;
		color: var(--ink);
		margin-bottom: 10px;
	}

	.empty-body {
		font-size: 14px;
		color: var(--ink-soft);
		line-height: 1.5;
		margin: 0 0 28px;
		max-width: 280px;
	}

	.empty-cta {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 12px 22px;
		border: none;
		border-radius: 12px;
		background: var(--ink);
		color: var(--paper);
		font-size: 14px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
	}
</style>
