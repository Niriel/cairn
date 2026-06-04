<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import Button from '$lib/basic/components/Button.svelte';
	import EmptyState from '$lib/shared/components/EmptyState.svelte';
	import RefreshButton from '$lib/basic/components/RefreshButton.svelte';
	import {
		acceptInvitation,
		declineInvitation,
		invitations,
		loadInbox
	} from '$lib/invite/state/invitations.svelte';
	import { timeAgo } from '$lib/shared/model/time-ago';

	$effect(() => {
		void loadInbox();
	});

	async function handleAccept(id: string) {
		try {
			const { listId } = await acceptInvitation(id);
			await goto(resolve(`/lists/${listId}`));
		} catch {
			// error handled by caller via toast in a future task
		}
	}
</script>

<div class="screen">
	<AppTopBar sub="{invitations.inbox.length} pending">
		Invites
		{#snippet right()}
			<RefreshButton
				data-test="inbox-refresh"
				spinning={invitations.inboxLoading}
				onclick={() => void loadInbox()}
			/>
		{/snippet}
	</AppTopBar>

	<div class="content">
		{#if invitations.inboxLoading}
			<div class="loading caption" data-test="inbox-loading">Loading…</div>
		{:else if invitations.inbox.length === 0}
			<EmptyState
				icon="inbox"
				title="No pending invites"
				body="When someone invites you to their list, it'll appear here."
				data-test="inbox-empty"
			/>
		{:else}
			<p class="intro caption">
				People who've invited you to their lists. Accept to join, or decline to clear.
			</p>
			<ul class="list rows">
				{#each invitations.inbox as entry (entry.id)}
					<li class="row" data-test="inbox-row-{entry.id}">
						<div class="row-top media">
							<Avatar
								displayName={entry.inviterName}
								size={36}
								uid={entry.inviterUid}
								avatarVersion={entry.inviterAvatarVersion}
							/>
							<div class="row-info">
								<p class="row-inviter caption">
									<strong class="inviter-name">{entry.inviterName}</strong>
									<span class="invited-label">invited you to</span>
								</p>
								<h3 class="list-name">{entry.listName}</h3>
							</div>
							<span class="when caption mono">{timeAgo(entry.createdAt)}</span>
						</div>
						<div class="buttons">
							<Button
								variant="pill"
								tone="ink"
								size="sm"
								data-test="inbox-decline-{entry.id}"
								onclick={() => void declineInvitation(entry.id)}>Decline</Button
							>
							<Button
								variant="pill"
								tone="sage"
								size="sm"
								data-test="inbox-accept-{entry.id}"
								onclick={() => void handleAccept(entry.id)}>Accept</Button
							>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.content {
		flex: 1 1 auto;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.loading {
		padding: 1rem 1.125rem;
	}

	.intro {
		padding: 0.875rem 1.125rem 0.375rem;
		margin: 0;
	}

	.list {
		margin-top: 0.375rem;
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.875rem 1.125rem;
	}

	.row-info {
		flex: 1;
		min-width: 0;
	}

	.row-inviter {
		margin: 0;
	}

	/* The inviter name reads as ink against the stone caption line — emphasis
	   colour on the <strong>, not drift. */
	.inviter-name {
		color: var(--ink);
	}

	.list-name {
		margin-top: 0.125rem;
	}

	.when {
		flex-shrink: 0;
	}

	.buttons {
		display: flex;
		gap: 0.5rem;
	}

	/* Both pills span the row equally; <Button> is inline-flex by default. */
	.buttons > :global(button) {
		flex: 1;
	}
</style>
