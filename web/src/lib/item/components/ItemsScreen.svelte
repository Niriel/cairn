<script lang="ts">
	import { tick, untrack } from 'svelte';
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
	import Badge from '$lib/basic/components/Badge.svelte';
	import IconButton from '$lib/basic/components/IconButton.svelte';
	import MoreButton from '$lib/shared/components/MoreButton.svelte';
	import UndoSnackbar from '$lib/shared/components/UndoSnackbar.svelte';
	import EmptyState from '$lib/shared/components/EmptyState.svelte';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import AccordionRow from '$lib/shared/components/AccordionRow.svelte';
	import Fab from '$lib/basic/components/Fab.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import VoteControl from './VoteControl.svelte';
	import AddEditItemSheet from './AddEditItemSheet.svelte';
	import DeleteItemSheet from './DeleteItemSheet.svelte';
	import ItemOverflowSheet from './ItemOverflowSheet.svelte';
	import ListOverflowSheet from '$lib/list/components/ListOverflowSheet.svelte';

	type ListMeta = {
		name: string;
		description: string | null;
		is_public: boolean;
		list_members: { user_id: string }[];
	};

	type Props = { listId: string };
	let { listId }: Props = $props();

	let listMeta = $state<ListMeta>({
		name: '',
		description: null,
		is_public: false,
		list_members: []
	});
	let overflowOpen = $state(false);
	let openId = $state<string | null>(null);
	let addSheetOpen = $state(false);
	let editSheetItem = $state<Item | null>(null);
	let deleteSheetItem = $state<Item | null>(null);
	let overflowItem = $state<Item | null>(null);

	async function reloadMeta() {
		await pgGet<ListMeta[]>(
			`/lists?id=eq.${listId}&select=name,description,is_public,list_members(user_id)&list_members.deleted_at=is.null`
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
		// untrack: pushHistoryGuard → pushState reads SvelteKit's internal
		// history state, which would otherwise re-track this effect and re-push
		// a fresh guard on every change — stacking history entries until neither
		// the TopBar back nor the browser back can escape the pile.
		return untrack(() =>
			pushHistoryGuard(() => {
				openId = null;
			})
		);
	});

	function toggleRow(id: string) {
		openId = openId === id ? null : id;
	}

	// Closing an overlay tears down its history guard, which calls history.back()
	// whose popstate is async. To swap one overlay for another — overflow → Edit
	// or overflow → Delete — we must let that popstate land *before* pushing the
	// next guard. Otherwise the back() and the new pushState race within one tick
	// and desync the back-stack (its single suppress flag can only track one
	// in-flight pop), which over-pops and can strand the user off the screen.
	// Sequencing keeps exactly one history.back() in flight at a time. Mirrors the
	// onviewtrash handler below.
	function closeOverlayAndSettle(close: () => void): Promise<void> {
		const settled = new Promise<void>((r) =>
			window.addEventListener('popstate', () => r(), { once: true })
		);
		close();
		// tick() flushes Svelte so the overlay unmounts and its guard cleanup runs.
		return tick().then(() => settled);
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
		{#snippet subAfter()}
			{#if listMeta.is_public}
				<span class="public-marker" data-test="list-public-marker">
					<span aria-hidden="true">·</span>
					<Icon name="globe" size={13} />
					Public
				</span>
			{/if}
		{/snippet}
		{#snippet right()}
			<IconButton
				icon="rotate-ccw"
				aria-label="Refresh"
				data-test="items-refresh"
				disabled={items.loading}
				onclick={refreshItems}
			/>
			<MoreButton aria-label="More options" onclick={() => (overflowOpen = true)} />
		{/snippet}
	</TopBar>

	<div class="screen-body">
		{#if items.loading}
			<div class="loading caption" data-test="items-loading">Loading…</div>
		{:else if items.rows.length === 0}
			<EmptyState
				data-test="items-empty"
				icon="feather"
				title="Nothing here yet"
				body="Drop the first stone — add an item with a name and (optionally) a note."
				ctaLabel="Add the first item"
				onCta={() => (addSheetOpen = true)}
			/>
		{:else}
			<ul class="rows">
				{#each items.rows as item (item.id)}
					<li class="row" class:open={openId === item.id}>
						<AccordionRow
							title={item.name}
							open={openId === item.id}
							onclick={() => toggleRow(item.id)}
							data-test="row-{item.id}"
						>
							{#snippet trailing()}
								{#if item.score !== 0}
									<Badge tone="score" sign={item.score > 0 ? 'positive' : 'negative'}>
										{item.score > 0 ? '+' : ''}{item.score}
									</Badge>
								{/if}
							{/snippet}
						</AccordionRow>
						{#if openId === item.id}
							<div data-test="item-extra" class="extra surface-alt">
								<div class="extra-body">
									{#if item.notes}
										<div class="notes body" data-test="item-notes-{item.id}">{item.notes}</div>
									{:else}
										<div class="notes no-notes body" data-test="item-notes-{item.id}">
											(no notes)
										</div>
									{/if}
									<div class="votes-row">
										{#if item.member_votes.length > 0}
											<div class="member-votes">
												{#each item.member_votes as mv (mv.user_id)}
													<span class="member-vote fine">
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
										{:else}
											<span class="no-votes body" data-test="item-votes-{item.id}">(no votes)</span>
										{/if}
										<div class="vote-control-slot">
											<VoteControl
												value={item.my_vote}
												onchange={(v: number | null) => handleVote(item.id, v)}
											/>
										</div>
									</div>
									<div class="attribution fine">
										Added by <strong
											data-test="attribution-creator-{item.id}"
											class:tombstone={item.created_by === TOMBSTONE_UID}
											>{item.created_by_name}</strong
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
								</div>
								<span class="more">
									<MoreButton
										aria-label="Item options"
										data-test="item-overflow-{item.id}"
										onclick={() => (overflowItem = item)}
										style="color: var(--stone)"
									/>
								</span>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

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
			ondelete={async () => {
				// The item is gone, so the row behind the sheet is stale. Close the
				// sheet, let its history.back() settle, then close the row so its
				// guard tears down too — sequenced, so the two backs don't race.
				await closeOverlayAndSettle(() => (deleteSheetItem = null));
				openId = null;
			}}
			oncancel={() => (deleteSheetItem = null)}
		/>
	{/if}

	{#if overflowItem}
		<ItemOverflowSheet
			itemName={overflowItem.name}
			onedit={async () => {
				const item = overflowItem;
				// Close the overflow sheet and let its history.back() settle before
				// opening the editor, so we never pop and push in the same tick. The
				// open row stays behind, so backing out of the editor returns to it.
				await closeOverlayAndSettle(() => (overflowItem = null));
				editSheetItem = item;
			}}
			ondelete={async () => {
				const item = overflowItem;
				await closeOverlayAndSettle(() => (overflowItem = null));
				deleteSheetItem = item;
			}}
			onclose={() => (overflowItem = null)}
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
		isPublic={listMeta.is_public}
		onpublicchange={(value: boolean) => {
			listMeta.is_public = value;
		}}
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
	/* Public-list marker in the TopBar sub line: "· 🌐 Public". inline-flex keeps
	   the separator, globe, and label on one baseline; the gap puts even space
	   between the dot and the icon (and the icon and the label). Inherits the
	   muted .caption colour from the sub line. */
	.public-marker {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		/* Match the internal gap so "member · 🌐 Public" is evenly spaced — the
		   gap only spaces items inside the marker, not the marker from the
		   preceding sub text. */
		margin-left: 0.3rem;
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	/* Open-row tint — a genuine toggled state, so the background lives here as a
	   scoped one-liner referencing the surface token rather than as a class. */
	.row.open {
		background: var(--paper-alt);
	}

	/* Tighten the AccordionRow button's md horizontal inset (Button default
	   1.125rem) to 0.8rem, matching the Lists screen's nav-rows. Vertical padding
	   is 0 — AccordionRow's 44px content bands set the row height (see
	   AccordionRow). This lives at the call site because from here the selector
	   out-specifies Button's own `.text.size-md` padding. This 0.8rem
	   padding-right is also the chevron's anchor: the `.more` button in the extra
	   panel is aligned to it (see the alignment invariant on `.more` below).
	   Changing it here means re-checking that. */
	.row :global(.accordion-row button) {
		padding: 0 0.8rem;
	}

	/* The extra panel is a row: the content column (notes, votes, attribution)
	   beside the More button, which reserves its own space at the end rather than
	   floating over the content. align-items:flex-start keeps the ⋮ in the
	   top-end corner. The 0.8rem right padding aligns the ⋮ under the chevron
	   (see .more); the 0.8rem left padding aligns the content under the title. */
	.extra {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.625rem 0.8rem 1rem 0.8rem;
		border-top: 1px dashed var(--rule);
	}

	/* The content column: notes, votes and attribution stacked with an even gap.
	   min-width:0 lets the notes/attribution ellipsize instead of pushing the
	   More button off the edge. */
	.extra-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* The More button at the end of the row. It's a 44px IconButton box around a
	   24px glyph, and .extra's 0.8rem right padding equals the accordion button's
	   padding-right (set in `.row :global(.accordion-row button)`), so the ⋮ glyph
	   centres at the same (right + 22px) as the row's chevron and sits directly
	   under it. The wrapping span keeps its forwarded class off IconButton's own
	   sizing. ALIGNMENT INVARIANT: keep .extra's right padding == that
	   padding-right while both stay 44px boxes with equal glyphs. */
	.more {
		flex-shrink: 0;
	}

	/* Editorial serif-italic for free-text notes — an annotated exception to the
	   global type roles (.body supplies size/colour/leading). */
	.notes {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-style: italic;
	}

	/* Empty-state placeholders for notes and votes — a quiet muted italic aside,
	   matching the Lists screen's "(no description)" treatment. The notes
	   placeholder drops the serif (it's a state label, not editorial content). */
	.no-notes {
		font-family: inherit;
		color: var(--stone);
	}

	.no-votes {
		color: var(--stone);
		font-style: italic;
	}

	/* The voters list and the VoteControl share one row; the control is pushed to
	   the right edge (margin-left:auto on its slot) and stays there even when no
	   one has voted yet and the member-votes block is absent. Centred so the voter
	   chips sit vertically level with the taller vote buttons rather than riding
	   high against their top. */
	.votes-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.vote-control-slot {
		flex: none;
		margin-left: auto;
	}

	.member-votes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.625rem;
		align-items: center;
	}

	.member-vote {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
	}

	/* Per-member vote sign — state colour only; the value inherits the .fine name
	   typeface so the count sits level with the name beside it. */
	.mv-val.positive {
		color: var(--sage);
	}

	.mv-val.negative {
		color: var(--ember);
	}

	/* Name emphasis within the muted attribution line. */
	.attribution strong {
		color: var(--ink-soft);
		font-weight: 600;
	}

	/* Tombstone (deleted-user) name — editorial serif-italic exception. */
	.attribution strong.tombstone {
		font-style: italic;
		font-weight: normal;
		color: var(--stone-lt);
		font-family: 'Newsreader Variable', Georgia, serif;
	}

	/* Single-instance undo toast — its inverted ink/paper chrome is bespoke to
	   this screen (not the globalised .toast-error error banner). */
	.undo-snackbar {
		position: fixed;
		left: max(0px, calc(50% - var(--app-max-w) / 2 + 0.75rem));
		right: max(0px, calc(50% - var(--app-max-w) / 2 + 0.75rem));
		bottom: calc(env(safe-area-inset-bottom) + 18px);
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.875rem 1rem;
		background: var(--ink);
		color: var(--paper);
		border-radius: 0.75rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
		z-index: 200;
	}

	.snackbar-text {
		flex: 1;
		font-size: 0.875rem;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
</style>
