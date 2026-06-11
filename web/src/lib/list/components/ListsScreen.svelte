<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import CairnGlyph from '$lib/shared/components/CairnGlyph.svelte';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import IconButton from '$lib/basic/components/IconButton.svelte';
	import Fab from '$lib/basic/components/Fab.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import MoreButton from '$lib/shared/components/MoreButton.svelte';
	import UndoSnackbar from '$lib/shared/components/UndoSnackbar.svelte';
	import EmptyState from '$lib/shared/components/EmptyState.svelte';
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
		<EmptyState
			data-test="lists-empty"
			title="Start your first cairn"
			body="A cairn is a small stack of stones hikers leave to mark the way. Make a list of things — movies, books, places — and share it with friends."
			ctaLabel="Create your first list"
			onCta={() => (createSheetOpen = true)}
		>
			{#snippet iconContent()}
				<CairnGlyph size={44} color="var(--stone)" />
			{/snippet}
		</EmptyState>
	{:else}
		<ul class="rows">
			{#each lists.items as item (item.id)}
				<li class="row" data-test="list-row-{item.id}">
					<div class="row-top media">
						<Button
							variant="text"
							tone="ink"
							size="md"
							data-test="list-nav-{item.id}"
							style="flex: 1; min-width: 0; padding: 0;"
							onclick={() => {
								void goto(resolve(`/lists/${item.id}`));
							}}
							><span class="name row-title">{item.name}</span>{#if item.is_public}<span
									class="public-marker"
									data-test="list-public-marker-{item.id}"
									><Icon name="globe" size={14} /><span class="sr-only">Public list</span></span
								>{/if}</Button
						>
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
							class="desc body"
							class:expanded={expandedIds.has(item.id)}
							data-test="list-desc-{item.id}"
							onclick={() => toggleDesc(item.id)}
						>
							<span class="desc-text" bind:this={descTextEls[item.id]}>{item.description}</span>
							{#if expandedIds.has(item.id)}
								<span class="see-toggle fine">(see less)</span>
							{:else if truncatedIds.has(item.id)}
								<span class="see-toggle fine">(see more)</span>
							{/if}
						</button>
					{:else}
						<div class="desc no-desc body" data-test="list-desc-{item.id}">(no description)</div>
					{/if}
					<div class="meta fine">
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
				</li>
			{/each}
		</ul>
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
		isPublic={overflowList.is_public}
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

	.row {
		padding: 0.875rem 1.125rem;
	}

	.row-top {
		padding-bottom: 0.5rem;
		border-bottom: 1px dashed var(--rule);
	}

	.name {
		flex: 1;
		min-width: 0;
		/* Override <Button>'s base white-space: nowrap so a long list name wraps
		   instead of overflowing the row (and breaks very long unbroken tokens). */
		white-space: normal;
		overflow-wrap: anywhere;
	}

	/* Public-list marker: a muted globe immediately after the name. flex-shrink:0
	   keeps it from being squeezed by a long wrapping name; centred against the
	   name block. */
	.public-marker {
		display: inline-flex;
		align-items: center;
		align-self: center;
		flex-shrink: 0;
		margin-left: 0.375rem;
		color: var(--stone);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}

	.desc {
		display: flex;
		/* top, not baseline: the smaller (see more/less) toggle is always shorter
		   than the description line, so aligning to the top keeps the row height =
		   the text line — the toggle can't push content below it down a few px
		   when it appears on expand (baseline alignment grew the line). Top also
		   keeps the toggle beside the first line when an expanded description
		   wraps, rather than centred against the whole block. */
		align-items: flex-start;
		gap: 0.25rem;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		font: inherit;
		margin-top: 0.5rem;
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
	}

	/* The placeholder reads as a quiet italic aside — a state on the .body desc. */
	.desc.no-desc {
		cursor: default;
		color: var(--stone);
		font-style: italic;
	}

	.meta {
		margin-top: 0.375rem;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	/* Faint separator dot between metadata fields. */
	.dot {
		color: var(--stone-lt);
	}

	.avatars {
		display: inline-flex;
		align-items: center;
	}
</style>
