<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/basic/components/Button.svelte';
	import Badge from '$lib/basic/components/Badge.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import InviteCard from '$lib/invite/components/InviteCard.svelte';
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
		<InviteCard
			{entry}
			acceptDataTest="invites-banner-accept"
			declineDataTest="invites-banner-decline"
			onAccept={() => void handleAccept(entry.id)}
			onDecline={() => void declineInvitation(entry.id)}
		/>
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
			<Badge tone="primary">{invitations.inbox.length}</Badge>
			<h3 class="multi-text">{invitations.inbox.length} pending invites</h3>
			<Icon name="chevron-right" size={18} />
		</Button>
	</div>
{/if}

<style>
	.banner {
		margin: 0.5rem 1.125rem 0.5rem;
		padding: 0.875rem;
	}

	.multi-text {
		flex: 1;
	}
</style>
