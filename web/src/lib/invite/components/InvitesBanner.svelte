<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/basic/components/Icon.svelte';
	import Avatar from '$lib/shared/components/Avatar.svelte';
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
			// toast handled by caller in future tasks
		}
	}
</script>

{#if invitations.inbox.length === 1}
	{@const entry = invitations.inbox[0]}
	<div class="banner" data-test="invites-banner">
		<div class="row">
			<Avatar
				displayName={entry.inviterName}
				size={28}
				uid={entry.inviterUid}
				avatarVersion={entry.inviterAvatarVersion}
			/>
			<div class="copy">
				<span class="bold">{entry.inviterName}</span>
				<span class="grey">invited you to</span>
				<span class="bold">{entry.listName}</span>
			</div>
		</div>
		<div class="buttons">
			<button
				class="btn-decline"
				data-test="invites-banner-decline"
				onclick={() => void declineInvitation(entry.id)}>Decline</button
			>
			<button
				class="btn-accept"
				data-test="invites-banner-accept"
				onclick={() => void handleAccept(entry.id)}>Accept</button
			>
		</div>
	</div>
{:else if invitations.inbox.length > 1}
	<div class="banner" data-test="invites-banner">
		<button
			class="multi-row"
			data-test="invites-banner-multi"
			onclick={() => void goto(resolve('/settings/invites'))}
		>
			<span class="count-badge">{invitations.inbox.length}</span>
			<span class="multi-text">{invitations.inbox.length} pending invites</span>
			<Icon name="chevron-right" size={18} />
		</button>
	</div>
{/if}

<style>
	.banner {
		margin: 8px 18px 14px;
		padding: 14px;
		background: var(--paper-alt);
		border: 1px solid var(--rule);
		border-radius: 12px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.copy {
		flex: 1;
		min-width: 0;
		font-size: 13.5px;
		color: var(--ink);
		line-height: 1.4;
	}

	.bold {
		font-weight: 600;
	}

	.grey {
		color: var(--stone);
	}

	.buttons {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}

	.btn-decline,
	.btn-accept {
		flex: 1;
		padding: 8px 0;
		border-radius: 999px;
		font-size: 13px;
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

	.multi-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
	}

	.count-badge {
		width: 32px;
		height: 32px;
		border-radius: 99px;
		background: var(--ink);
		color: var(--paper);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		font-weight: 700;
		flex-shrink: 0;
	}

	.multi-text {
		flex: 1;
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
	}
</style>
