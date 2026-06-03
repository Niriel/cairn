<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/basic/components/Button.svelte';
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
			<Button
				variant="pill"
				tone="ink"
				size="sm"
				data-test="invites-banner-decline"
				onclick={() => void declineInvitation(entry.id)}>Decline</Button
			>
			<Button
				variant="pill"
				tone="sage"
				size="sm"
				data-test="invites-banner-accept"
				onclick={() => void handleAccept(entry.id)}>Accept</Button
			>
		</div>
	</div>
{:else if invitations.inbox.length > 1}
	<div class="banner" data-test="invites-banner">
		<Button
			variant="text"
			tone="ink"
			size="md"
			data-test="invites-banner-multi"
			onclick={() => void goto(resolve('/settings/invites'))}
		>
			<span class="count-badge">{invitations.inbox.length}</span>
			<span class="multi-text">{invitations.inbox.length} pending invites</span>
			<Icon name="chevron-right" size={18} />
		</Button>
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
		gap: 0.5rem;
		margin-top: 0.625rem;
	}

	/* Both pills span the row equally; <Button> is inline-flex by default. */
	.buttons > :global(button) {
		flex: 1;
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
