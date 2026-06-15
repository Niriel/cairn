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
	import NavRow from '$lib/shared/components/NavRow.svelte';
	import UndoSnackbar from '$lib/shared/components/UndoSnackbar.svelte';
	import EmptyState from '$lib/shared/components/EmptyState.svelte';
	import WelcomeBanner from '$lib/shared/components/WelcomeBanner.svelte';
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

	<WelcomeBanner />

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
					<NavRow
						title={item.name}
						data-test="list-nav-{item.id}"
						onclick={() => void goto(resolve(`/lists/${item.id}`))}
					>
						{#snippet trailing()}{#if item.is_public}<span
									class="public-marker"
									data-test="list-public-marker-{item.id}"
									><Icon name="globe" size={14} /><span class="sr-only">Public list</span></span
								>{/if}{/snippet}
					</NavRow>
					<div class="extra">
						<span class="more">
							<MoreButton
								size={18}
								aria-label="List options"
								data-test="list-overflow-{item.id}"
								onclick={() => (overflowList = item)}
								style="color: var(--stone)"
							/>
						</span>
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

	/* Reserve space below the last row so it clears the fixed FAB floating over
	   the content; without this the bottom list is permanently obscured. */
	.rows {
		padding-bottom: var(--fab-clearance);
	}

	/* The NavRow's inner button supplies the title's top/left inset, so the row
	   itself carries no padding (otherwise the title would be indented twice). */
	.row {
		padding: 0;
	}

	/* Horizontal real estate is scarce, so tighten the NavRow button's default
	   md inset (0.75rem 1.125rem) to 0.5rem 0.8rem on this screen. The dependent
	   offsets below (.extra left inset, .more) track this 0.8rem horizontal. */
	.row :global(.nav-row button) {
		padding: 0.5rem 0.8rem;
	}

	/* Extra-info block beneath the title nav-row: the More button (absolutely
	   pinned top-end), description, and metadata. The wide right inset lets the
	   ellipsizing description and metadata clear the More button. The full-bleed
	   dashed rule (moved here from the old .row-top) separates title from extra
	   info; it is edge-to-edge like the solid per-row divider now that .row has
	   no padding. The left inset aligns description/meta under the title text. */
	.extra {
		position: relative;
		padding: 0.5rem 2.5rem 0.875rem 0.8rem;
		border-top: 1px dashed var(--rule);
	}

	/* The More button, pinned to the top-end corner of the extra-info block. The
	   wrapping span is positioned (not the MoreButton itself) so its forwarded
	   class can't clobber IconButton's .icon-btn padding. right: 0.55rem lines
	   the More icon's centre up under the nav-row chevron's centre: the chevron
	   sits ~22px from the row's right edge (0.8rem button padding + half of an
	   18px icon), and the IconButton's 18px icon centres 13px from its own right
	   edge, so the button's right edge needs to sit ~9px (0.55rem) in. */
	/* ALIGNMENT INVARIANT: the ⋮ glyph sits under the nav-row's chevron only while
	   right (0.55rem) + IconButton padding (4px) == nav-row button padding-right
	   (0.8rem, above). The chevron is the fixed anchor; this button is what grows.
	   If IconButton's padding increases for a 44px touch target (4px → ~13px),
	   drop this `right` by the same amount (→ ~0) so the widened button doesn't
	   push the glyph left out of line. Same coupling as the Items screen. */
	.more {
		position: absolute;
		top: 0.375rem;
		right: 0.55rem;
	}

	/* Public-list marker: a muted globe in the nav-row's trailing slot, so it
	   sits at the row's right edge just before the chevron. flex-shrink:0 keeps
	   it from being squeezed by a long wrapping name. No align-self override, so
	   it inherits the button's align-items: flex-start and pins to the top of a
	   wrapped multi-line name like the chevron, rather than centring against it.
	   margin-top nudges it down by half the size gap to the chevron ((18-14)/2 =
	   2px) so the smaller globe's optical centre lines up with the chevron's
	   instead of riding high against its top. */
	.public-marker {
		display: inline-flex;
		flex-shrink: 0;
		margin-top: 0.125rem;
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
