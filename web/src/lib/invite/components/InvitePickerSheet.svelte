<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import Label from '$lib/basic/components/Label.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import Snackbar from '$lib/shared/components/Snackbar.svelte';
	import { sendInvitation } from '$lib/invite/state/invitations.svelte';
	import { relationships } from '$lib/privacy/state/relationships.svelte';
	import { lists } from '$lib/list/state/lists.svelte';
	import { profile } from '$lib/shared/state/profile.svelte';

	type Props = { listId: string; currentMemberIds: string[]; onclose: () => void };
	let { listId, currentMemberIds, onclose }: Props = $props();

	const memberIdSet = $derived(new Set(currentMemberIds));
	const invitedIds = new SvelteSet<string>();
	let username = $state('');
	let toastOpen = $state(false);
	let toastMessage = $state('');

	const circleRows = $derived(
		relationships.circle.filter(
			(c) => c.otherUserId !== profile.uid && !memberIdSet.has(c.otherUserId)
		)
	);

	type CoMember = {
		userId: string;
		displayName: string;
		avatarVersion: number;
		sharedCount: number;
	};

	const hasTappableRows = $derived(
		relationships.circle.some(
			(c) => c.otherUserId !== profile.uid && !memberIdSet.has(c.otherUserId)
		) ||
			lists.items.some((l) =>
				l.list_members.some(
					(m) =>
						m.user_id !== profile.uid &&
						!memberIdSet.has(m.user_id) &&
						!relationships.circle.some((c) => c.otherUserId === m.user_id)
				)
			)
	);

	const coMemberRows = $derived.by<CoMember[]>(() => {
		const circleIds = new Set(relationships.circle.map((c) => c.otherUserId));
		// Local Map inside a $derived; no cross-frame reactivity needed.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const byUser = new Map<string, CoMember>();
		for (const list of lists.items) {
			for (const m of list.list_members) {
				if (m.user_id === profile.uid) continue;
				if (memberIdSet.has(m.user_id)) continue;
				if (circleIds.has(m.user_id)) continue;
				const existing = byUser.get(m.user_id);
				if (existing) {
					existing.sharedCount += 1;
				} else {
					byUser.set(m.user_id, {
						userId: m.user_id,
						displayName: m.profiles.display_name,
						avatarVersion: m.profiles.avatar_version,
						sharedCount: 1
					});
				}
			}
		}
		return [...byUser.values()].sort((a, b) => b.sharedCount - a.sharedCount);
	});

	async function inviteUser(userId: string) {
		try {
			await sendInvitation(listId, { userId });
			invitedIds.add(userId);
			toastMessage = 'Invite sent';
			toastOpen = true;
		} catch (err) {
			toastMessage = err instanceof Error ? err.message : "Couldn't send invite";
			toastOpen = true;
		}
	}

	async function sendByUsername() {
		const value = username.trim();
		if (!value) return;
		try {
			// Usernames are public, so the wrapper distinguishes the three
			// outcomes for us: it resolves on success, and throws "No one on
			// Cairn has that username" / "Couldn't send invite" for the miss
			// and the generic (block/policy) failures respectively.
			await sendInvitation(listId, { username: value });
			username = '';
			toastMessage = 'Invite sent';
			toastOpen = true;
		} catch (err) {
			toastMessage = err instanceof Error ? err.message : "Couldn't send invite";
			toastOpen = true;
		}
	}
</script>

<Sheet open={true} {onclose} data-test="invite-picker">
	<header class="header">
		<h2 class="title t-sheet">Add someone</h2>
		<p class="subtitle caption">
			{#if hasTappableRows}
				Tap to invite, or type a username below
			{:else}
				Invite someone by username
			{/if}
		</p>
	</header>

	<div class="body">
		{#if circleRows.length > 0}
			<section>
				<h2 class="section-label">Your circle</h2>
				<ul class="rows">
					{#each circleRows as row (row.otherUserId)}
						<li class="row media" data-test="invite-picker-circle-row-{row.otherUserId}">
							<Avatar
								displayName={row.displayName}
								size={32}
								uid={row.otherUserId}
								avatarVersion={row.avatarVersion}
							/>
							<div class="info">
								<h3 class="name">{row.displayName}</h3>
								<span class="sub caption">In your circle</span>
							</div>
							{#if invitedIds.has(row.otherUserId)}
								<span class="invited" data-test="invite-picker-invited-{row.otherUserId}">
									<Icon name="check" size={18} />
								</span>
							{:else}
								<Button
									variant="pill"
									tone="ink"
									size="sm"
									data-test="invite-picker-invite-{row.otherUserId}"
									onclick={() => void inviteUser(row.otherUserId)}>Invite</Button
								>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if coMemberRows.length > 0}
			<section>
				<h2 class="section-label">People you share other lists with</h2>
				<ul class="rows">
					{#each coMemberRows as row (row.userId)}
						<li class="row media" data-test="invite-picker-comember-row-{row.userId}">
							<Avatar
								displayName={row.displayName}
								size={32}
								uid={row.userId}
								avatarVersion={row.avatarVersion}
							/>
							<div class="info">
								<h3 class="name">{row.displayName}</h3>
								<span class="sub caption">On {row.sharedCount} of your other lists</span>
							</div>
							{#if invitedIds.has(row.userId)}
								<span class="invited" data-test="invite-picker-invited-{row.userId}">
									<Icon name="check" size={18} />
								</span>
							{:else}
								<Button
									variant="pill"
									tone="ink"
									size="sm"
									data-test="invite-picker-invite-{row.userId}"
									onclick={() => void inviteUser(row.userId)}>Invite</Button
								>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>

	<section class="username-section surface-alt">
		<Label for="invite-picker-username-input">By username</Label>
		<form
			class="username-row"
			onsubmit={(e) => {
				e.preventDefault();
				void sendByUsername();
			}}
		>
			<div class="username-input-wrap">
				<TextInput
					id="invite-picker-username-input"
					placeholder="@username"
					data-test="invite-picker-username-input"
					bind:value={username}
				/>
			</div>
			<Button variant="rect" tone="ink" type="submit" data-test="invite-picker-username-send"
				>Send</Button
			>
		</form>
	</section>
</Sheet>

<Snackbar
	open={toastOpen}
	message={toastMessage}
	data-test="invite-picker-toast"
	onclose={() => (toastOpen = false)}
/>

<style>
	.header {
		padding: 0.25rem 0.25rem 0.75rem;
	}

	.subtitle {
		margin-top: 0.125rem;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	/* Section title look comes from the global h2; only its spacing is local. */
	.section-label {
		padding: 0.875rem 0.25rem 0.375rem;
	}

	.rows {
		display: flex;
		flex-direction: column;
	}

	.row {
		padding: 0.75rem 0.25rem;
	}

	.info {
		flex: 1;
		min-width: 0;
	}

	.sub {
		margin-top: 0.125rem;
	}

	.invited {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* State colour: the affirmative tick on an already-invited row. */
		color: var(--sage);
	}

	.username-section {
		padding: 0.875rem 0.25rem 0.25rem;
		border-top: 1px solid var(--rule);
	}

	/* The <Label> primitive renders an inline <label>; make it a block with a
	   gap to the input below. */
	.username-section :global(label) {
		display: block;
		margin-bottom: 0.5rem;
	}

	.username-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.username-input-wrap {
		flex: 1;
	}
</style>
