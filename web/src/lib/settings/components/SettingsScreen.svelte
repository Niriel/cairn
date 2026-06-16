<script lang="ts">
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import NavRow from '$lib/shared/components/NavRow.svelte';
	import Badge from '$lib/basic/components/Badge.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import type { IconName } from '$lib/basic/model/icon-paths';
	import { ICON_SIZE } from '$lib/shared/model/constants';
	import { profile } from '$lib/shared/state/profile.svelte';
	import { preferences } from '$lib/shared/state/preferences.svelte';
	import type { FontSize, Theme } from '$lib/shared/state/preferences.svelte';
	import { signOut } from '$lib/shared/state/session.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { invitations } from '$lib/invite/state/invitations.svelte';

	const themes: { value: Theme; label: string; icon: IconName }[] = [
		{ value: 'light', label: 'Light', icon: 'sun' },
		{ value: 'dark', label: 'Dark', icon: 'moon' },
		{ value: 'system', label: 'System', icon: 'smartphone' }
	];

	const fontSizes: { value: FontSize; label: string; px: number }[] = [
		{ value: 'xs', label: 'XS', px: 11 },
		{ value: 's', label: 'S', px: 13 },
		{ value: 'm', label: 'M', px: 15 },
		{ value: 'l', label: 'L', px: 18 },
		{ value: 'xl', label: 'XL', px: 21 }
	];
</script>

<div class="screen">
	<AppTopBar>Settings</AppTopBar>

	<div class="content">
		<section class="profile-chip-section">
			<h2>Profile</h2>
			<div class="nav-rows">
				{#if profile.displayName === null}
					<div data-test="profile-chip-skeleton" class="skeleton">
						<div class="skeleton-avatar"></div>
						<div class="skeleton-name"></div>
					</div>
				{:else}
					<NavRow
						title={profile.displayName}
						data-test="profile-chip"
						onclick={() => goto(resolve('/profile'))}
					>
						{#snippet lead()}
							<span class="profile-avatar-lead">
								<Avatar
									displayName={profile.displayName ?? ''}
									size={36}
									uid={profile.uid ?? ''}
									avatarVersion={profile.avatarVersion}
									data-test="profile-avatar"
								/>
							</span>
						{/snippet}
					</NavRow>
				{/if}
			</div>
		</section>

		<section class="preference-group">
			<h2>People</h2>
			<div class="nav-rows">
				<NavRow
					title="Invites"
					sub={invitations.inbox.length > 0
						? invitations.inbox.length + ' pending'
						: 'No pending invites'}
					data-test="settings-invites"
					onclick={() => goto(resolve('/settings/invites'))}
				>
					{#snippet lead()}<Icon name="inbox" size={ICON_SIZE} />{/snippet}
					{#snippet trailing()}
						{#if invitations.inbox.length > 0}
							<Badge tone="primary">{invitations.inbox.length}</Badge>
						{/if}
					{/snippet}
				</NavRow>
				<NavRow
					title="Privacy"
					sub="Who can invite you · circle · blocked"
					data-test="settings-privacy"
					onclick={() => goto(resolve('/settings/privacy'))}
				>
					{#snippet lead()}<Icon name="shield" size={ICON_SIZE} />{/snippet}
				</NavRow>
			</div>
		</section>

		<section class="preference-group">
			<h2>Colour theme</h2>
			<div class="theme-grid">
				{#each themes as t (t.value)}
					{@const sel = preferences.theme === t.value}
					<button
						class="theme-option card"
						class:selected={sel}
						aria-pressed={sel}
						data-test="theme-{t.value}"
						onclick={() => (preferences.theme = t.value)}
					>
						<Icon name={t.icon} size={20} />
						<span>{t.label}</span>
					</button>
				{/each}
			</div>
		</section>

		<section class="preference-group">
			<h2>Text size</h2>
			<div class="size-card card-alt">
				{#each fontSizes as f (f.value)}
					{@const sel = preferences.fontSize === f.value}
					<button
						class="size-option"
						class:selected={sel}
						aria-pressed={sel}
						data-test="fontsize-{f.value}"
						style="font-size: {f.px}px"
						onclick={() => (preferences.fontSize = f.value)}>A</button
					>
				{/each}
			</div>
		</section>

		<section class="preference-group">
			<h2>Privacy &amp; data</h2>
			<div class="nav-rows">
				<NavRow
					title="Download my data"
					sub="A copy of everything Cairn stores"
					data-test="settings-download-data"
					onclick={() => goto(resolve('/settings/data-export'))}
				>
					{#snippet lead()}<Icon name="download" size={ICON_SIZE} />{/snippet}
				</NavRow>
			</div>
		</section>

		<section class="preference-group">
			<h2>Recovery</h2>
			<div class="nav-rows">
				<NavRow
					title="Deleted lists"
					sub="Restore lists you've deleted"
					data-test="settings-deleted-lists"
					onclick={() => goto(resolve('/settings/deleted-lists'))}
				>
					{#snippet lead()}<Icon name="trash-2" size={ICON_SIZE} />{/snippet}
				</NavRow>
			</div>
		</section>

		<section class="preference-group">
			<h2>Account</h2>
			<div class="nav-rows">
				<NavRow title="Sign out" data-test="signout" onclick={signOut}>
					{#snippet lead()}<Icon name="log-out" size={ICON_SIZE} />{/snippet}
				</NavRow>
				<NavRow
					title="Delete account"
					data-test="delete-account"
					tone="destructive"
					onclick={() => goto(resolve('/settings/delete-account'))}
				>
					{#snippet lead()}<Icon name="trash" size={ICON_SIZE} />{/snippet}
				</NavRow>
			</div>
		</section>
	</div>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	/* The profile avatar sits in NavRow's 44px lead band. 4px padding insets the
	   image to 36px so it reads as an icon rather than filling the slot edge to
	   edge, while the lead footprint stays 44px. */
	.profile-avatar-lead {
		display: inline-flex;
		padding: 4px;
	}

	.content {
		flex: 1 1 auto;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.skeleton {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.125rem;
	}

	.skeleton-avatar {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--skeleton-base, #e0e0e0);
		animation: shimmer 1.4s infinite linear;
	}

	.skeleton-name {
		width: 120px;
		height: 1rem;
		border-radius: 4px;
		background: var(--skeleton-base, #e0e0e0);
		animation: shimmer 1.4s infinite linear;
	}

	@keyframes shimmer {
		0% {
			background-position: -200px 0;
		}
		100% {
			background-position: 200px 0;
		}
	}

	.preference-group {
		display: flex;
		flex-direction: column;
	}

	.preference-group h2,
	.profile-chip-section h2 {
		padding: 1.375rem 1.125rem 0.5rem;
	}

	/* Appearance grid */
	.theme-grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.5rem;
		padding: 0 1.125rem;
	}

	/* .card supplies border + radius + paper bg; the rest is control chrome:
	   the centred icon+label layout and the small control-label type. */
	.theme-option {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.375rem;
		padding: 0.875rem 0.5rem;
		color: var(--stone);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
	}

	/* Selected is genuine state, not drift: the option fills and inks up. */
	.theme-option.selected {
		border-color: var(--ink);
		background: var(--paper-alt);
		color: var(--ink);
		font-weight: 600;
	}

	/* Text size card — .card-alt gives the surface; layout only here. */
	.size-card {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.375rem;
		padding: 0.875rem 0.75rem;
		margin: 0 1.125rem;
	}

	/* Segmented control chrome: each cell is an unstyled button; the selected
	   cell inks up (genuine state). */
	.size-option {
		flex: 1;
		text-align: center;
		padding: 0.5rem 0;
		border-radius: 0.5rem;
		border: none;
		background: transparent;
		color: var(--stone);
		font-weight: 500;
		line-height: 1;
		cursor: pointer;
	}

	.size-option.selected {
		background: var(--ink);
		color: var(--paper);
		font-weight: 700;
	}
</style>
