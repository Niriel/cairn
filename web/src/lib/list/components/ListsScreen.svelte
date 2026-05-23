<script lang="ts">
	import { goto } from '$app/navigation';

	import Fab from '$lib/basic/components/Fab.svelte';
	import Accordion from '$lib/shared/components/Accordion.svelte';
	import TopBar from '$lib/shared/components/TopBar.svelte';
	import { lists, refreshLists } from '$lib/list/state/lists.svelte';

	import CreateListSheet from './CreateListSheet.svelte';

	let createSheetOpen = $state(false);
	let expandedId = $state<string | null>(null);
</script>

<TopBar>Lists</TopBar>

{#if lists.loading}
	<div data-test="lists-loading">Loading…</div>
{:else if lists.items.length === 0}
	<p data-test="lists-empty">No lists yet. Tap + to create one.</p>
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

<Fab
	data-test="lists-fab"
	onclick={() => {
		createSheetOpen = true;
	}}>+</Fab
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
