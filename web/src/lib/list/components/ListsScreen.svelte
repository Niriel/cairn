<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import CairnGlyph from '$lib/shared/components/CairnGlyph.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import Fab from '$lib/basic/components/Fab.svelte';
	import TopBar from '$lib/shared/components/TopBar.svelte';
	import { profile } from '$lib/shared/state/profile.svelte';
	import { lists, refreshLists } from '$lib/list/state/lists.svelte';

	import CreateListSheet from './CreateListSheet.svelte';

	let createSheetOpen = $state(false);
	const expandedIds = new SvelteSet<string>();

	function toggleDesc(id: string) {
		if (expandedIds.has(id)) expandedIds.delete(id);
		else expandedIds.add(id);
	}

	function formatDate(iso: string): string {
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		}).format(new Date(iso));
	}
</script>

<div class="screen">
	<TopBar
		showBack={false}
		sub={profile.displayName ? `Signed in as ${profile.displayName}` : undefined}
	>
		{#snippet left()}
			<CairnGlyph size={26} color="var(--accent)" />
		{/snippet}
		Cairn
		{#snippet right()}
			<button
				class="icon-btn"
				aria-label="Settings"
				data-test="lists-settings"
				onclick={() => goto(resolve('/settings'))}
			>
				<Icon name="settings" size={22} />
			</button>
		{/snippet}
	</TopBar>

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
					<div class="row-inner">
						<div class="row-body">
							<button
								class="name"
								data-test="list-nav-{item.id}"
								onclick={() => {
									// eslint-disable-next-line svelte/no-navigation-without-resolve
									void goto('/lists/' + item.id); // swap to resolve() when /lists/[id] route exists
								}}
							>
								{item.name}
							</button>
							{#if item.description !== null}
								<button
									class="desc"
									class:expanded={expandedIds.has(item.id)}
									data-test="list-desc-{item.id}"
									onclick={() => toggleDesc(item.id)}
								>
									{item.description}
								</button>
							{:else}
								<div class="desc no-desc" data-test="list-desc-{item.id}">(no description)</div>
							{/if}
							<div class="meta">{formatDate(item.modified_at)}</div>
						</div>
						<span class="chevron"><Icon name="chevron-right" size={18} /></span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<Fab
	data-test="lists-fab"
	onclick={() => {
		createSheetOpen = true;
	}}><Icon name="plus" size={24} /></Fab
>

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

	.row-inner {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}

	.row-body {
		flex: 1;
		min-width: 0;
	}

	.name {
		display: block;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 17px;
		font-weight: 600;
		letter-spacing: -0.005em;
		color: var(--ink);
		line-height: 1.3;
	}

	.desc {
		display: block;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		font: inherit;
		margin-top: 4px;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--ink-soft);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.desc.expanded {
		white-space: normal;
		overflow: visible;
		text-overflow: unset;
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
	}

	.chevron {
		flex-shrink: 0;
		color: var(--stone-lt);
		display: flex;
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

	/* ── Settings button ── */

	.icon-btn {
		background: none;
		border: none;
		padding: 4px;
		color: var(--ink);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
