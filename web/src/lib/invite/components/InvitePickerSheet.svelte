<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import Icon from '$lib/basic/components/Icon.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';
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
	let email = $state('');
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

	async function sendByEmail() {
		const value = email.trim();
		if (!value) return;
		try {
			await sendInvitation(listId, { email: value });
			email = '';
			// Anti-enumeration: the inviter must not be able to tell whether
			// the address has a Cairn account (see docs/invites.md). Same
			// hedge regardless of whether the row was user-keyed or
			// email-keyed under the hood.
			toastMessage = 'If they have a Cairn account, the invite was sent.';
			toastOpen = true;
		} catch (err) {
			toastMessage = err instanceof Error ? err.message : "Couldn't send invite";
			toastOpen = true;
		}
	}
</script>

<Sheet open={true} {onclose} data-test="invite-picker">
	<div class="header">
		<div class="title">Add someone</div>
		<div class="subtitle">
			{#if hasTappableRows}
				Tap to invite, or type an e-mail below
			{:else}
				Invite someone by e-mail
			{/if}
		</div>
	</div>

	<div class="body">
		{#if circleRows.length > 0}
			<div class="section-label">Your circle</div>
			<div class="rows">
				{#each circleRows as row (row.otherUserId)}
					<div class="row" data-test="invite-picker-circle-row-{row.otherUserId}">
						<Avatar
							displayName={row.displayName}
							size={32}
							uid={row.otherUserId}
							avatarVersion={row.avatarVersion}
						/>
						<div class="info">
							<div class="name">{row.displayName}</div>
							<div class="sub">In your circle</div>
						</div>
						{#if invitedIds.has(row.otherUserId)}
							<span class="invited" data-test="invite-picker-invited-{row.otherUserId}">
								<Icon name="check" size={18} />
							</span>
						{:else}
							<button
								class="invite-btn"
								data-test="invite-picker-invite-{row.otherUserId}"
								onclick={() => void inviteUser(row.otherUserId)}>Invite</button
							>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if coMemberRows.length > 0}
			<div class="section-label">People you share other lists with</div>
			<div class="rows">
				{#each coMemberRows as row (row.userId)}
					<div class="row" data-test="invite-picker-comember-row-{row.userId}">
						<Avatar
							displayName={row.displayName}
							size={32}
							uid={row.userId}
							avatarVersion={row.avatarVersion}
						/>
						<div class="info">
							<div class="name">{row.displayName}</div>
							<div class="sub">On {row.sharedCount} of your other lists</div>
						</div>
						{#if invitedIds.has(row.userId)}
							<span class="invited" data-test="invite-picker-invited-{row.userId}">
								<Icon name="check" size={18} />
							</span>
						{:else}
							<button
								class="invite-btn"
								data-test="invite-picker-invite-{row.userId}"
								onclick={() => void inviteUser(row.userId)}>Invite</button
							>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="email-section">
		<label class="section-label email-label" for="invite-picker-email-input">By e-mail</label>
		<form
			class="email-row"
			onsubmit={(e) => {
				e.preventDefault();
				void sendByEmail();
			}}
		>
			<input
				id="invite-picker-email-input"
				class="email-input"
				type="email"
				inputmode="email"
				autocomplete="email"
				placeholder="friend@example.net"
				data-test="invite-picker-email-input"
				bind:value={email}
			/>
			<button class="send-btn" type="submit" data-test="invite-picker-email-send">Send</button>
		</form>
	</div>
</Sheet>

<Snackbar
	open={toastOpen}
	message={toastMessage}
	data-test="invite-picker-toast"
	onclose={() => (toastOpen = false)}
/>

<style>
	.header {
		padding: 4px 4px 12px;
	}

	.title {
		font-size: 17px;
		font-weight: 600;
		color: var(--ink);
	}

	.subtitle {
		font-size: 12.5px;
		color: var(--stone);
		margin-top: 2px;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.section-label {
		font-size: 11.5px;
		color: var(--stone);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 14px 4px 6px;
	}

	.rows {
		display: flex;
		flex-direction: column;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 4px;
		border-top: 1px solid var(--rule);
	}

	.row:last-child {
		border-bottom: 1px solid var(--rule);
	}

	.info {
		flex: 1;
		min-width: 0;
	}

	.name {
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
	}

	.sub {
		font-size: 11.5px;
		color: var(--stone);
		margin-top: 2px;
	}

	.invite-btn {
		padding: 7px 14px;
		border: 1px solid var(--ink);
		border-radius: 999px;
		background: transparent;
		color: var(--ink);
		font-size: 12.5px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
	}

	.invited {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--sage);
	}

	.email-section {
		padding: 14px 4px 4px;
		border-top: 1px solid var(--rule);
		background: var(--paper-alt);
	}

	.email-label {
		padding: 0 0 8px;
	}

	.email-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.email-input {
		flex: 1;
		padding: 12px 14px;
		border: 1px solid var(--rule);
		border-radius: 12px;
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		font-size: 16px;
		outline: none;
	}

	.email-input::placeholder {
		color: var(--stone);
	}

	.email-input:focus {
		border-color: var(--ink);
	}

	.send-btn {
		padding: 0.75rem 1rem;
		border: none;
		border-radius: 12px;
		background: var(--ink);
		color: var(--paper);
		font-size: 14px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
	}
</style>
