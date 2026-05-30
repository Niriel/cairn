<script lang="ts">
	import { listTrash, loadDeletedLists, restoreOne } from '$lib/list/state/list-trash.svelte';
	import { timeAgo } from '$lib/shared/model/time-ago';

	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import IconButton from '$lib/basic/components/IconButton.svelte';

	$effect(() => {
		void loadDeletedLists();
	});
</script>

<div class="screen">
	<AppTopBar showBack={true}>
		Deleted lists
		{#snippet right()}
			<IconButton
				aria-label="Refresh"
				data-test="deleted-lists-refresh"
				disabled={listTrash.loading}
				onclick={() => void loadDeletedLists()}
			>
				<Icon name="rotate-ccw" size={22} />
			</IconButton>
		{/snippet}
	</AppTopBar>

	{#if listTrash.loading}
		<div class="loading" data-test="deleted-lists-loading">Loading…</div>
	{:else if listTrash.rows.length === 0 && !listTrash.error}
		<div class="empty" data-test="deleted-lists-empty">
			<div class="empty-circle">
				<Icon name="trash-2" size={44} />
			</div>
			<div class="empty-heading">No deleted lists.</div>
		</div>
	{:else}
		<div class="rows">
			{#each listTrash.rows as row, i (row.id)}
				<div class="row" class:first={i === 0} data-test="deleted-list-row-{row.id}">
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
						data-test="deleted-list-restore-{row.id}"
						onclick={() => void restoreOne(row.id)}>Restore</Button
					>
				</div>
			{/each}
		</div>
	{/if}

	{#if listTrash.error}
		<div class="error" data-test="deleted-lists-error">{listTrash.error}</div>
	{/if}
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		min-height: 100%;
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

	.empty-heading {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 22px;
		font-weight: 500;
		color: var(--ink);
		letter-spacing: -0.01em;
	}

	.rows {
		margin-top: 14px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 18px;
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
		font-size: 15px;
		font-weight: 600;
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
