<script lang="ts">
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import Button from '$lib/basic/components/Button.svelte';
	import { timeAgo } from '$lib/shared/model/time-ago';
	import type { InboxEntry } from '$lib/invite/state/invitations.svelte';

	let {
		entry,
		onAccept,
		onDecline,
		acceptDataTest,
		declineDataTest
	}: {
		entry: InboxEntry;
		onAccept: () => void;
		onDecline: () => void;
		acceptDataTest?: string;
		declineDataTest?: string;
	} = $props();
</script>

<div class="media">
	<Avatar
		displayName={entry.inviterName}
		size={36}
		uid={entry.inviterUid}
		avatarVersion={entry.inviterAvatarVersion}
	/>
	<div class="info">
		<p class="inviter body">
			<strong>{entry.inviterName}</strong>
			<span class="grey">invited you to</span>
			<strong>{entry.listName}</strong>
		</p>
		<span class="when caption">{timeAgo(entry.createdAt)}</span>
	</div>
</div>
<div class="buttons">
	<Button variant="pill" tone="ink" size="sm" data-test={declineDataTest} onclick={onDecline}
		>Decline</Button
	>
	<Button variant="pill" tone="sage" size="sm" data-test={acceptDataTest} onclick={onAccept}
		>Accept</Button
	>
</div>

<style>
	.info {
		flex: 1;
		min-width: 0;
	}

	.inviter {
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
		margin-top: 0.75rem;
	}

	/* Both pills span the row equally; <Button> is inline-flex by default. */
	.buttons > :global(button) {
		flex: 1;
	}
</style>
