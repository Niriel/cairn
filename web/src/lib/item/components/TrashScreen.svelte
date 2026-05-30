<script lang="ts">
	import { itemTrash, loadTrash, restoreOne } from '$lib/item/state/item-trash.svelte';
	import { timeAgo } from '$lib/shared/model/time-ago';

	import TopBar from '$lib/shared/components/TopBar.svelte';
	import Button from '$lib/basic/components/Button.svelte';
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
		<div class="loading" data-test="trash-loading">Loading…</div>
	{:else if itemTrash.rows.length === 0 && !itemTrash.error}
		<div class="empty" data-test="trash-empty">
			<div class="empty-circle">
				<Icon name="trash-2" size={44} />
			</div>
			<div class="empty-heading">Nothing in the bin.</div>
		</div>
	{:else}
		<div class="rows">
			{#each itemTrash.rows as row, i (row.id)}
				<div class="row" class:first={i === 0} data-test="trash-row-{row.id}">
					<span class="row-icon">
						<Icon name="rotate-ccw" size={16} />
					</span>
					<div class="meta">
						<span class="name">{row.name}</span>
						<span class="attribution"
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
				</div>
			{/each}
		</div>
	{/if}

	{#if itemTrash.error}
		<div class="error" data-test="trash-error">{itemTrash.error}</div>
	{/if}
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}

	.description {
		padding: 14px 18px 6px;
	}

	.loading {
		padding: 16px 18px;
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

	.row-icon {
		display: inline-flex;
		color: var(--stone);
	}

	.empty-heading {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 22px;
		font-weight: 500;
		color: var(--ink);
		letter-spacing: -0.01em;
	}

	.rows {
		margin-top: 10px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 18px 14px 20px;
		min-height: 56px;
		border-bottom: 1px solid var(--rule);
	}

	.row.first {
		border-top: 1px solid var(--rule);
	}

	.meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.name {
		font-size: 15.5px;
		font-weight: 500;
		color: var(--ink);
		line-height: 1.35;
	}

	.attribution {
		font-size: 12px;
		color: var(--stone);
		margin-top: 2px;
	}

	.error {
		position: fixed;
		left: max(0px, calc(50% - var(--app-max-w) / 2 + 12px));
		right: max(0px, calc(50% - var(--app-max-w) / 2 + 12px));
		bottom: calc(env(safe-area-inset-bottom) + 18px);
		padding: 14px 16px;
		color: var(--ember);
		background: var(--paper);
		border: 1px solid var(--ember);
		border-radius: 12px;
		font-size: 13.5px;
		text-align: center;
		z-index: 200;
	}
</style>
