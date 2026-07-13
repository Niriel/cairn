<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import RefreshButton from '$lib/basic/components/RefreshButton.svelte';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import ProfileSheet from '$lib/profile/components/ProfileSheet.svelte';
	import InvitePickerSheet from '$lib/invite/components/InvitePickerSheet.svelte';
	import { loadSent, pendingInviteFor } from '$lib/invite/state/invitations.svelte';
	import { profile } from '$lib/shared/state/profile.svelte';
	import { pgGet } from '$lib/shared/http/postgrest';
	import { timeAgo } from '$lib/shared/model/time-ago';
	import { TOMBSTONE_UID } from '$lib/shared/model/constants';

	type MemberRow = {
		user_id: string;
		created_at: string;
		lists: { created_by: string; name: string };
		profiles: { display_name: string; avatar_version: number; username: string };
	};

	type Props = { listId: string };
	let { listId }: Props = $props();

	let rows = $state<MemberRow[]>([]);
	let loading = $state(false);
	let openProfile = $state<MemberRow | null>(null);
	let pickerOpen = $state(false);

	const listName = $derived(rows[0]?.lists.name ?? '');
	const createdBy = $derived(rows[0]?.lists.created_by ?? '');
	const countLabel = $derived(
		`${rows.length} ${rows.length === 1 ? 'person' : 'people'} on this list`
	);

	function subLine(m: MemberRow): string {
		if (m.user_id === profile.uid && createdBy === profile.uid) return 'You · created the list';
		if (m.user_id === createdBy) return 'Created the list';
		return `Joined ${timeAgo(m.created_at)}`;
	}

	async function loadMembers(): Promise<void> {
		loading = true;
		try {
			rows = await pgGet<MemberRow[]>(
				`/list_members?list_id=eq.${listId}&deleted_at=is.null&select=user_id,created_at,lists(created_by,name),profiles!user_id(display_name,avatar_version,username)`
			);
		} finally {
			loading = false;
		}
	}

	let loadedFor: string | undefined;
	$effect(() => {
		if (loadedFor === listId) return;
		loadedFor = listId;
		void loadSent();
		void loadMembers();
	});
</script>

<div class="screen" data-test="members-screen">
	<AppTopBar sub={listName}>
		Members
		{#snippet right()}
			<RefreshButton
				data-test="members-refresh"
				spinning={loading}
				onclick={() => void loadMembers()}
			/>
		{/snippet}
	</AppTopBar>

	<div class="screen-body">
		{#if loading}
			<div class="loading caption" data-test="members-loading">Loading…</div>
		{:else}
			<section>
				<h2 class="section-label">{countLabel}</h2>
				<ul class="rows">
					{#each rows as m (m.user_id)}
						<li>
							<button
								class="row media"
								class:is-self={m.user_id === profile.uid}
								data-test="member-row-{m.user_id}"
								disabled={m.user_id === profile.uid}
								onclick={() => {
									if (m.user_id !== profile.uid) openProfile = m;
								}}
							>
								<Avatar
									displayName={m.profiles.display_name}
									size={36}
									uid={m.user_id}
									avatarVersion={m.profiles.avatar_version}
								/>
								<div class="info">
									<span class="name row-title">{m.profiles.display_name}</span>
									{#if m.user_id !== TOMBSTONE_UID}
										<span class="handle identity-handle">@{m.profiles.username}</span>
									{/if}
									<span class="sub caption">{subLine(m)}</span>
								</div>
								{#if m.user_id !== profile.uid}
									<Icon name="more-vertical" size={18} />
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</section>

			<div class="add-wrap">
				<Button
					variant="rect"
					tone="primary"
					data-test="members-add"
					onclick={() => (pickerOpen = true)}
				>
					<Icon name="user-plus" size={16} />
					<span class="add-label">Add member</span>
				</Button>
			</div>
		{/if}
	</div>
</div>

{#if openProfile}
	{@const m = openProfile}
	<ProfileSheet
		userId={m.user_id}
		displayName={m.profiles.display_name}
		username={m.profiles.username}
		avatarVersion={m.profiles.avatar_version}
		pendingInvitationId={pendingInviteFor(listId, m.user_id)}
		onclose={() => (openProfile = null)}
	/>
{/if}

{#if pickerOpen}
	<InvitePickerSheet
		{listId}
		currentMemberIds={rows.map((m) => m.user_id)}
		onclose={() => (pickerOpen = false)}
	/>
{/if}

<style>
	.loading {
		padding: 1rem 1.125rem;
	}

	.section-label {
		padding: 1.125rem 1.125rem 0.375rem;
	}

	.rows {
		display: flex;
		flex-direction: column;
	}

	.row {
		padding: 0.875rem 1.125rem;
		background: transparent;
		border-top: none;
		border-left: none;
		border-right: none;
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		width: 100%;
	}

	.row.is-self {
		cursor: default;
	}

	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.handle,
	.sub {
		margin-top: 0.125rem;
	}

	.add-wrap {
		padding: 1.5rem 1.125rem 1.125rem;
		display: flex;
		justify-content: center;
	}

	.add-label {
		margin-left: 0.5rem;
	}
</style>
