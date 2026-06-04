<script lang="ts">
	import { itemTrash, loadTrash, restoreOne } from '$lib/item/state/item-trash.svelte';
	import { timeAgo } from '$lib/shared/model/time-ago';

	import TopBar from '$lib/shared/components/TopBar.svelte';
	import Button from '$lib/basic/components/Button.svelte';
	import EmptyState from '$lib/shared/components/EmptyState.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import IconButton from '$lib/basic/components/IconButton.svelte';

	type Props = { listId: string };
	let { listId }: Props = $props();

	$effect(() => {
		void loadTrash(listId);
	});
</script>

<div class="screen">
	<TopBar showBack={true} sub={itemTrash.listName ?? undefined}>
		Bin
		{#snippet right()}
			<IconButton
				aria-label="Refresh"
				data-test="trash-refresh"
				disabled={itemTrash.loading}
				onclick={() => void loadTrash(listId)}
			>
				<Icon name="rotate-ccw" size={22} />
			</IconButton>
		{/snippet}
	</TopBar>

	<div class="description">
		<p class="explainer">
			Items you delete from this list land here. Tap Restore to bring one back.
		</p>
	</div>

	{#if itemTrash.loading}
		<div class="loading caption" data-test="trash-loading">Loading…</div>
	{:else if itemTrash.rows.length === 0 && !itemTrash.error}
		<EmptyState icon="trash-2" iconSize={44} title="Nothing in the bin." data-test="trash-empty" />
	{:else}
		<ul class="rows">
			{#each itemTrash.rows as row (row.id)}
				<li class="row" data-test="trash-row-{row.id}">
					<span class="row-icon">
						<Icon name="rotate-ccw" size={16} />
					</span>
					<div class="meta">
						<h3 class="name">{row.name}</h3>
						<span class="attribution caption"
							>deleted by {row.deleted_by_name} · {timeAgo(row.deleted_at)}</span
						>
					</div>
					<Button
						variant="pill"
						tone="ink"
						size="sm"
						data-test="trash-restore-{row.id}"
						onclick={() => void restoreOne(row.id)}>Restore</Button
					>
				</li>
			{/each}
		</ul>
	{/if}

	{#if itemTrash.error}
		<div class="toast-error" data-test="trash-error">{itemTrash.error}</div>
	{/if}
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}

	.description {
		padding: 0.875rem 1.125rem 0.375rem;
	}

	.loading {
		padding: 1rem 1.125rem;
	}

	/* Tints the leading row glyph a quiet stone. Kept local because it is purely
	   cosmetic icon colour, not part of the global type/role system. */
	.row-icon {
		display: inline-flex;
		color: var(--stone);
	}

	.rows {
		margin-top: 0.625rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.875rem 1.125rem 0.875rem 1.25rem;
		min-height: 3.5rem;
	}

	.meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.attribution {
		margin-top: 0.125rem;
	}
</style>
