<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import EmptyState from '$lib/shared/components/EmptyState.svelte';
	import {
		relationships,
		loadRelationships,
		unblock
	} from '$lib/privacy/state/relationships.svelte';
	import { blockedAtLabel } from '$lib/privacy/model/relationship';

	$effect(() => {
		if (!relationships.loaded) void loadRelationships();
	});
</script>

<div class="screen" data-test="blocked-screen">
	<AppTopBar>Blocked</AppTopBar>

	<p class="description caption">
		People you've blocked. They can't invite you to any list, regardless of your other privacy
		settings.
	</p>

	{#if relationships.loaded}
		{#if relationships.blocked.length === 0}
			<EmptyState
				icon="slash"
				iconSize={44}
				title="You haven't blocked anyone."
				data-test="blocked-empty"
			/>
		{:else}
			<ul class="blocked-list rows">
				{#each relationships.blocked as entry (entry.otherUserId)}
					<li class="row media" data-test="blocked-row-{entry.otherUserId}">
						<Avatar
							displayName={entry.displayName}
							uid={entry.otherUserId}
							avatarVersion={entry.avatarVersion}
							size={36}
						/>
						<div class="row-text">
							<h3 class="display-name">{entry.displayName}</h3>
							<span class="sub caption">{blockedAtLabel(entry.createdAt)}</span>
						</div>
						<Button
							variant="pill"
							tone="ink"
							size="sm"
							data-test="unblock-{entry.otherUserId}"
							onclick={() => void unblock(entry.otherUserId)}>Unblock</Button
						>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}

	.description {
		padding: 0.875rem 1.125rem 0.25rem;
	}

	.blocked-list {
		margin: 0.875rem 0 0;
	}

	.row {
		padding: 0.875rem 1.125rem;
	}

	.row-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.sub {
		margin-top: 0.125rem;
	}
</style>
