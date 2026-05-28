<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/basic/components/Icon.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import { cancelInvitation } from '$lib/invite/state/invitations.svelte';
	import {
		addCircleById,
		block as blockUser,
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
</script>

<Sheet open={true} {onclose} data-test="profile-sheet">
	<div class="handle"></div>

	<Avatar uid={userId} {displayName} size={68} {avatarVersion} />
	<p class="name">{displayName}</p>

	{#if relationships.loaded}
		{#if isInCircle}
			<span data-test="state-badge" class="badge circle">IN YOUR CIRCLE</span>
		{:else if isBlocked}
			<span data-test="state-badge" class="badge blocked">BLOCKED</span>
		{/if}
	{/if}

	{#if relationships.loaded}
		{#if isBlocked}
			<button
				data-test="unblock"
				class="action-row"
				onclick={async () => {
					await unblockUser(userId);
					onclose();
				}}
			>
				<Icon name="shield" />
				Unblock
			</button>
		{:else}
			{#if isInCircle}
				<button
					data-test="remove-from-circle"
					class="action-row"
					onclick={async () => {
						await removeFromCircle(userId);
						onclose();
					}}
				>
					<Icon name="user-check" />
					Remove from circle
				</button>
			{:else}
				<button
					data-test="add-to-circle"
					class="action-row"
					onclick={async () => {
						await addCircleById(userId);
					}}
				>
					<Icon name="user-plus" />
					<span>Add to your circle</span>
					<span class="subtitle">Lets you accept invites from them</span>
				</button>
			{/if}

			{#if pendingInvitationId}
				<button
					data-test="cancel-invite"
					class="action-row"
					onclick={async () => {
						await cancelInvitation(pendingInvitationId);
						onclose();
					}}
				>
					<Icon name="x" />
					Cancel pending invite
				</button>
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
				<button
					data-test="block"
					class="action-row block-action"
					onclick={() => {
						confirmBlockOpen = true;
					}}
				>
					<Icon name="slash" />
					Block
				</button>
			{/if}
		{/if}
	{/if}
</Sheet>

<style>
	.handle {
		width: 40px;
		height: 4px;
		border-radius: 99px;
		background: var(--stone-lt);
		margin: 0 auto 16px;
	}

	.name {
		font-size: 18px;
		font-weight: 600;
		text-align: center;
		margin: 12px 0 0;
	}

	.badge {
		display: block;
		font-size: 12px;
		font-weight: 600;
		font-family: monospace;
		text-align: center;
		margin-top: 6px;
	}

	.badge.circle {
		color: var(--sage);
	}

	.badge.blocked {
		color: var(--ember);
	}

	.action-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		border: 1px solid var(--rule);
		border-radius: 12px;
		padding: 14px;
		margin-top: 8px;
		background: none;
		text-align: left;
		cursor: pointer;
	}

	.action-row:first-of-type {
		margin-top: 18px;
	}

	.block-action {
		color: var(--ember);
	}

	.subtitle {
		display: block;
		font-size: 12px;
		opacity: 0.6;
	}

	.block-confirm {
		margin-top: 18px;
	}
</style>
