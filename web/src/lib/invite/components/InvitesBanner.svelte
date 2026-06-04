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
	<div class="banner card-alt" data-test="invites-banner">
		<div class="row media">
			<Avatar
				displayName={entry.inviterName}
				size={28}
				uid={entry.inviterUid}
				avatarVersion={entry.inviterAvatarVersion}
			/>
			<p class="copy body">
				<strong>{entry.inviterName}</strong>
				<span class="grey">invited you to</span>
				<strong>{entry.listName}</strong>
			</p>
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
			<span class="badge badge-ink">{invitations.inbox.length}</span>
			<h3 class="multi-text">{invitations.inbox.length} pending invites</h3>
			<Icon name="chevron-right" size={18} />
		</Button>
	</div>
{/if}

<style>
	.banner {
		margin: 0.5rem 1.125rem 0.875rem;
		padding: 0.875rem;
	}

	.row {
		gap: 0.625rem;
	}

	.copy {
		flex: 1;
		min-width: 0;
		margin: 0;
	}

	/* "invited you to" recedes against the ink names — emphasis colour, not
	   drift. */
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

	.multi-text {
		flex: 1;
	}
</style>
