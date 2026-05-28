<script lang="ts">
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
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

	<p class="description">
		People you've blocked. They can't invite you to any list, regardless of your other privacy
		settings.
	</p>

	{#if relationships.loaded}
		{#if relationships.blocked.length === 0}
			<div class="empty-state" data-test="blocked-empty">
				<Icon name="slash" size={28} />
				<p>You haven't blocked anyone.</p>
			</div>
		{:else}
			<ul class="blocked-list">
				{#each relationships.blocked as entry (entry.otherUserId)}
					<li class="row" data-test="blocked-row-{entry.otherUserId}">
						<Avatar
							displayName={entry.displayName}
							uid={entry.otherUserId}
							avatarVersion={entry.avatarVersion}
							size={36}
						/>
						<div class="row-text">
							<span class="display-name">{entry.displayName}</span>
							<span class="sub">{blockedAtLabel(entry.createdAt)}</span>
						</div>
						<button
							class="unblock-btn"
							data-test="unblock-{entry.otherUserId}"
							onclick={() => void unblock(entry.otherUserId)}
						>
							Unblock
						</button>
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
		font-size: 0.78rem;
		color: var(--stone);
		line-height: 1.5;
	}

	.empty-state {
		margin: 1.5rem 1.125rem;
		padding: 2.25rem 1.125rem;
		text-align: center;
		border: 1px dashed var(--stone-lt);
		border-radius: 0.875rem;
		background: var(--paper-alt);
		color: var(--stone);
	}

	.empty-state p {
		font-size: 0.875rem;
		margin-top: 0.625rem;
		margin-bottom: 0;
	}

	.blocked-list {
		list-style: none;
		margin: 0.875rem 0 0;
		padding: 0;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1.125rem;
		border-bottom: 1px solid var(--rule);
	}

	.row:first-child {
		border-top: 1px solid var(--rule);
	}

	.row-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.display-name {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--ink);
	}

	.sub {
		font-size: 0.72rem;
		color: var(--stone-lt);
		margin-top: 0.125rem;
		font-family: var(--mono);
	}

	.unblock-btn {
		padding: 0.4375rem 0.75rem;
		border: 1px solid var(--rule);
		border-radius: 999px;
		background: transparent;
		color: var(--stone);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
	}
</style>
