<script lang="ts">
	import { goto } from '$app/navigation';

	import Fab from '$lib/basic/components/Fab.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import Accordion from '$lib/shared/components/Accordion.svelte';
	import TopBar from '$lib/shared/components/TopBar.svelte';
	import { resolve } from '$app/paths';
	import { lists, refreshLists } from '$lib/list/state/lists.svelte';

	import CreateListSheet from './CreateListSheet.svelte';

	let createSheetOpen = $state(false);
	let expandedId = $state<string | null>(null);
</script>

<div class="screen">
	<TopBar showBack={false}>
		Lists
		{#snippet right()}
			<button
				class="settings-btn"
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
			<p>No lists yet.</p>
			<p>Tap <span class="fab-hint"><Icon name="plus" size={14} /></span> to create one.</p>
		</div>
	{:else}
		<ul>
			{#each lists.items as item (item.id)}
				<li data-test="list-row-{item.id}">
					{#if item.description !== null}
						<Accordion
							expanded={expandedId === item.id}
							pushesHistory={true}
							onexpand={() => {
								expandedId = item.id;
							}}
							oncollapse={() => {
								expandedId = null;
							}}
						>
							{#snippet header()}
								<button
									data-test="list-nav-{item.id}"
									onclick={() => {
										// eslint-disable-next-line svelte/no-navigation-without-resolve
										void goto('/lists/' + item.id); // swap to resolve() when /lists/[id] route exists
									}}>{item.name}</button
								>
							{/snippet}
							{#snippet body()}
								<p>{item.description}</p>
							{/snippet}
						</Accordion>
					{:else}
						<button
							data-test="list-nav-{item.id}"
							onclick={() => {
								// eslint-disable-next-line svelte/no-navigation-without-resolve
								void goto('/lists/' + item.id); // swap to resolve() when /lists/[id] route exists
							}}>{item.name}</button
						>
					{/if}
				</li>
			{/each}
		</ul>
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

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		text-align: center;
		padding: 2rem;
		color: var(--stone);
		font-size: 22px;
	}

	.empty p {
		margin: 0;
	}

	.settings-btn {
		background: none;
		border: none;
		padding: 4px;
		color: var(--ink);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.fab-hint {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.8em;
		height: 1.8em;
		border-radius: 5px;
		background: var(--ink);
		color: var(--paper);
		vertical-align: middle;
		margin-inline: 0.2em;
	}
</style>
