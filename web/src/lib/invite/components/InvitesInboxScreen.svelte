<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
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
			<div class="loading" data-test="inbox-loading">Loading…</div>
		{:else if invitations.inbox.length === 0}
			<div class="empty" data-test="inbox-empty">
				<div class="empty-circle">
					<Icon name="inbox" size={32} />
				</div>
				<div class="empty-heading">No pending invites</div>
				<p class="empty-body">When someone invites you to their list,<br /> it'll appear here.</p>
			</div>
		{:else}
			<p class="intro">
				People who've invited you to their lists. Accept to join, or decline to clear.
			</p>
			<div class="list">
				{#each invitations.inbox as entry, i (entry.id)}
					<div class="row" class:first={i === 0} data-test="inbox-row-{entry.id}">
						<div class="row-top">
							<Avatar
								displayName={entry.inviterName}
								size={36}
								uid={entry.inviterUid}
								avatarVersion={entry.inviterAvatarVersion}
							/>
							<div class="row-info">
								<div class="row-inviter">
									<span class="inviter-name">{entry.inviterName}</span>
									<span class="invited-label">invited you to</span>
								</div>
								<div class="list-name">{entry.listName}</div>
							</div>
							<span class="when">{timeAgo(entry.createdAt)}</span>
						</div>
						<div class="buttons">
							<button
								class="btn-decline"
								data-test="inbox-decline-{entry.id}"
								onclick={() => void declineInvitation(entry.id)}>Decline</button
							>
							<button
								class="btn-accept"
								data-test="inbox-accept-{entry.id}"
								onclick={() => void handleAccept(entry.id)}>Accept</button
							>
						</div>
					</div>
				{/each}
			</div>
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
		padding: 16px 18px;
		color: var(--stone);
	}

	/* ── Empty state ── */

	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 36px;
		text-align: center;
	}

	.empty-circle {
		width: 96px;
		height: 96px;
		border-radius: 99px;
		background: var(--paper-alt);
		border: 1px dashed var(--stone-lt);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 24px;
		color: var(--stone);
	}

	.empty-heading {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 24px;
		font-weight: 500;
		letter-spacing: -0.01em;
		color: var(--ink);
		margin-bottom: 10px;
	}

	.empty-body {
		font-size: 14px;
		color: var(--ink-soft);
		line-height: 1.5;
		margin: 0;
		max-width: 260px;
	}

	.intro {
		font-size: 12.5px;
		color: var(--stone);
		line-height: 1.5;
		padding: 14px 18px 6px;
		margin: 0;
	}

	.list {
		margin-top: 6px;
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--rule);
	}

	.row.first {
		border-top: 1px solid var(--rule);
	}

	.row-top {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.row-info {
		flex: 1;
		min-width: 0;
	}

	.row-inviter {
		font-size: 14px;
		color: var(--stone);
		line-height: 1.35;
	}

	.inviter-name {
		font-weight: 600;
		color: var(--ink);
	}

	.list-name {
		font-size: 15px;
		font-weight: 600;
		color: var(--ink);
		margin-top: 2px;
	}

	.when {
		font-size: 11px;
		color: var(--stone-lt);
		font-family: monospace;
		flex-shrink: 0;
	}

	.buttons {
		display: flex;
		gap: 8px;
	}

	.btn-decline,
	.btn-accept {
		flex: 1;
		padding: 9px 0;
		border-radius: 999px;
		font-size: 13.5px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
	}

	.btn-decline {
		border: 1px solid var(--rule);
		background: transparent;
		color: var(--stone);
	}

	.btn-accept {
		border: none;
		background: var(--sage);
		color: #fff;
	}
</style>
