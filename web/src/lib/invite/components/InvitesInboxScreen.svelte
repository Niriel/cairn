<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import EmptyState from '$lib/shared/components/EmptyState.svelte';
	import InviteCard from '$lib/invite/components/InviteCard.svelte';
	import RefreshButton from '$lib/basic/components/RefreshButton.svelte';
	import {
		acceptInvitation,
		declineInvitation,
		invitations,
		loadInbox
	} from '$lib/invite/state/invitations.svelte';

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

	<div class="screen-body">
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
						<InviteCard
							{entry}
							acceptDataTest="inbox-accept-{entry.id}"
							declineDataTest="inbox-decline-{entry.id}"
							onAccept={() => void handleAccept(entry.id)}
							onDecline={() => void declineInvitation(entry.id)}
						/>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<style>
	.screen-body {
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
		padding: 0.875rem 1.125rem;
	}
</style>
