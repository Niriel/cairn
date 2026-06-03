<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import { cancelInvitation } from '$lib/invite/state/invitations.svelte';
	import {
		addCircleById,
		block as blockUser,
		loadRelationships,
		relationships,
		removeFromCircle,
		unblock as unblockUser
	} from '$lib/privacy/state/relationships.svelte';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import ButtonPair from '$lib/shared/components/ButtonPair.svelte';
	import { profile } from '$lib/shared/state/profile.svelte';

	type Props = {
		userId: string;
		displayName: string;
		avatarVersion?: number;
		pendingInvitationId?: string | null;
		onclose: () => void;
	};

	let {
		userId,
		displayName,
		avatarVersion = 0,
		pendingInvitationId = null,
		onclose
	}: Props = $props();

	const isSelf = $derived(userId === profile.uid);
	const isInCircle = $derived(
		relationships.loaded && relationships.circle.some((e) => e.otherUserId === userId)
	);
	const isBlocked = $derived(
		relationships.loaded && relationships.blocked.some((e) => e.otherUserId === userId)
	);

	let confirmBlockOpen = $state(false);

	$effect(() => {
		if (isSelf) {
			void goto(resolve('/settings'));
			onclose();
		}
	});

	$effect(() => {
		if (!relationships.loaded) void loadRelationships();
	});
</script>

<Sheet open={true} {onclose} data-test="profile-sheet">
	<div class="sheet-handle"></div>

	<Avatar uid={userId} {displayName} size={68} {avatarVersion} />
	<h2 class="name identity-name">{displayName}</h2>

	{#if relationships.loaded}
		{#if isInCircle}
			<span data-test="state-badge" class="state-label circle caption mono">IN YOUR CIRCLE</span>
		{:else if isBlocked}
			<span data-test="state-badge" class="state-label blocked caption mono">BLOCKED</span>
		{/if}
	{/if}

	{#if relationships.loaded}
		<div class="actions">
			{#if isBlocked}
				<div class="action-card card">
					<Button
						variant="text"
						tone="ink"
						size="md"
						data-test="unblock"
						onclick={async () => {
							await unblockUser(userId);
							onclose();
						}}
					>
						<Icon name="shield" />
						Unblock
					</Button>
				</div>
			{:else}
				{#if isInCircle}
					<div class="action-card card">
						<Button
							variant="text"
							tone="ink"
							size="md"
							data-test="remove-from-circle"
							onclick={async () => {
								await removeFromCircle(userId);
								onclose();
							}}
						>
							<Icon name="user-check" />
							Remove from circle
						</Button>
					</div>
				{:else}
					<div class="action-card card">
						<Button
							variant="text"
							tone="ink"
							size="md"
							data-test="add-to-circle"
							onclick={async () => {
								await addCircleById(userId);
							}}
						>
							<Icon name="user-plus" />
							<span>Add to your circle</span>
							<span class="subtitle caption">Lets you accept invites from them</span>
						</Button>
					</div>
				{/if}

				{#if pendingInvitationId}
					<div class="action-card card">
						<Button
							variant="text"
							tone="ink"
							size="md"
							data-test="cancel-invite"
							onclick={async () => {
								await cancelInvitation(pendingInvitationId);
								onclose();
							}}
						>
							<Icon name="x" />
							Cancel pending invite
						</Button>
					</div>
				{/if}

				{#if confirmBlockOpen}
					<div data-test="block-confirm" class="block-confirm">
						<p>Block {displayName}? They won't be able to invite you to any list.</p>
						<ButtonPair>
							{#snippet left()}
								<button
									onclick={() => {
										confirmBlockOpen = false;
									}}>Cancel</button
								>
							{/snippet}
							{#snippet right()}
								<button
									data-test="block-confirm-block"
									onclick={async () => {
										await blockUser(userId);
										onclose();
									}}>Block</button
								>
							{/snippet}
						</ButtonPair>
					</div>
				{:else}
					<div class="action-card card">
						<Button
							variant="text"
							tone="destructive"
							size="md"
							data-test="block"
							onclick={() => {
								confirmBlockOpen = true;
							}}
						>
							<Icon name="slash" />
							Block
						</Button>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</Sheet>

<style>
	.name {
		text-align: center;
		margin: 0.75rem 0 0;
	}

	/* The state label is centred block text, not a pill — its sage/ember colour
	   is a per-state one-liner, not drift. */
	.state-label {
		display: block;
		text-align: center;
		margin-top: 0.375rem;
	}

	.state-label.circle {
		color: var(--sage);
	}

	.state-label.blocked {
		color: var(--ember);
	}

	.actions {
		margin-top: 1.125rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* .card supplies the border + radius; clip the inner full-width button. */
	.action-card {
		overflow: hidden;
	}

	.subtitle {
		display: block;
	}

	.block-confirm {
		margin-top: 1.125rem;
	}
</style>
