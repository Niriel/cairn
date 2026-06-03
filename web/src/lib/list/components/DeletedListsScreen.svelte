<script lang="ts">
	import { listTrash, loadDeletedLists, restoreOne } from '$lib/list/state/list-trash.svelte';
	import { timeAgo } from '$lib/shared/model/time-ago';

	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import Button from '$lib/basic/components/Button.svelte';
	import EmptyState from '$lib/shared/components/EmptyState.svelte';
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
		<div class="loading caption" data-test="deleted-lists-loading">Loading…</div>
	{:else if listTrash.rows.length === 0 && !listTrash.error}
		<EmptyState
			icon="trash-2"
			iconSize={44}
			title="No deleted lists."
			data-test="deleted-lists-empty"
		/>
	{:else}
		<ul class="rows">
			{#each listTrash.rows as row (row.id)}
				<li class="row" data-test="deleted-list-row-{row.id}">
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
						data-test="deleted-list-restore-{row.id}"
						onclick={() => void restoreOne(row.id)}>Restore</Button
					>
				</li>
			{/each}
		</ul>
	{/if}

	{#if listTrash.error}
		<div class="toast-error" data-test="deleted-lists-error">{listTrash.error}</div>
	{/if}
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}

	.loading {
		padding: 1rem 1.125rem;
	}

	.rows {
		margin-top: 0.875rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1.125rem;
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
