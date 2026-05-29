<script lang="ts">
	import Icon from '$lib/basic/components/Icon.svelte';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import ProfileSheet from '$lib/profile/components/ProfileSheet.svelte';
	import InvitePickerSheet from '$lib/invite/components/InvitePickerSheet.svelte';
	import { loadSent, pendingInviteFor } from '$lib/invite/state/invitations.svelte';
	import { profile } from '$lib/shared/state/profile.svelte';
	import { pgGet } from '$lib/shared/http/postgrest';
	import { timeAgo } from '$lib/shared/model/time-ago';

	type MemberRow = {
		user_id: string;
		created_at: string;
		lists: { created_by: string; name: string };
		profiles: { display_name: string; avatar_version: number };
	};

	type Props = { listId: string };
	let { listId }: Props = $props();

	let rows = $state<MemberRow[]>([]);
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

	$effect(() => {
		void loadSent();
		void pgGet<MemberRow[]>(
			`/list_members?list_id=eq.${listId}&deleted_at=is.null&select=user_id,created_at,lists(created_by,name),profiles!user_id(display_name,avatar_version)`
		).then((result) => {
			rows = result;
		});
	});
</script>

<div class="screen" data-test="members-screen">
	<AppTopBar sub={listName}>Members</AppTopBar>

	<div class="content">
		<div class="section-label">{countLabel}</div>
		<div class="rows">
			{#each rows as m (m.user_id)}
				<button
					class="row"
					data-test="member-row-{m.user_id}"
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
						<div class="name">{m.profiles.display_name}</div>
						<div class="sub">{subLine(m)}</div>
					</div>
					{#if m.user_id !== profile.uid}
						<Icon name="more-horizontal" size={18} />
					{/if}
				</button>
			{/each}
		</div>

		<div class="add-wrap">
			<button class="add-btn" data-test="members-add" onclick={() => (pickerOpen = true)}>
				<Icon name="user-plus" size={16} />
				<span>Add member</span>
			</button>
		</div>
	</div>
</div>

{#if openProfile}
	{@const m = openProfile}
	<ProfileSheet
		userId={m.user_id}
		displayName={m.profiles.display_name}
		avatarVersion={m.profiles.avatar_version}
		pendingInvitationId={pendingInviteFor(listId, m.user_id)}
		onclose={() => (openProfile = null)}
	/>
{/if}

{#if pickerOpen}
	<InvitePickerSheet {listId} onclose={() => (pickerOpen = false)} />
{/if}

<style>
	.screen {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.content {
		flex: 1;
		overflow-y: auto;
	}

	.section-label {
		font-size: 11.5px;
		color: var(--stone);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 18px 18px 6px;
	}

	.rows {
		display: flex;
		flex-direction: column;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--rule);
		background: transparent;
		border-top: none;
		border-left: none;
		border-right: none;
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		width: 100%;
	}

	.row:last-of-type {
		border-bottom: none;
	}

	.info {
		flex: 1;
		min-width: 0;
	}

	.name {
		font-size: 15px;
		font-weight: 600;
		color: var(--ink);
	}

	.sub {
		font-size: 12px;
		color: var(--stone);
		margin-top: 2px;
	}

	.add-wrap {
		padding: 24px 18px 18px;
	}

	.add-btn {
		width: 100%;
		padding: 12px 14px;
		border: 1px dashed var(--stone-lt);
		border-radius: 12px;
		background: var(--paper-alt);
		color: var(--ink-soft);
		font-size: 14px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
</style>
