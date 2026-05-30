<script lang="ts">
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import type { IconName } from '$lib/basic/model/icon-paths';
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

	const currentSize = $derived(
		fontSizes.find((f) => f.value === preferences.fontSize) ?? fontSizes[2]
	);
</script>

<div class="screen">
	<AppTopBar>Settings</AppTopBar>

	<div class="content">
		<section class="profile-chip-section">
			{#if profile.displayName === null}
				<div data-test="profile-chip-skeleton" class="skeleton">
					<div class="skeleton-avatar"></div>
					<div class="skeleton-name"></div>
				</div>
			{:else}
				<Button
					variant="text"
					tone="ink"
					size="md"
					data-test="profile-chip"
					onclick={() => goto(resolve('/profile'))}
				>
					<Avatar
						displayName={profile.displayName}
						size={44}
						uid={profile.uid ?? ''}
						avatarVersion={profile.avatarVersion}
						data-test="profile-avatar"
					/>
					<span class="display-name">{profile.displayName}</span>
					<Icon name="chevron-right" size={18} />
				</Button>
			{/if}
		</section>

		<section class="preference-group">
			<h2>People</h2>
			<Button
				variant="text"
				tone="ink"
				size="md"
				data-test="settings-invites"
				onclick={() => goto(resolve('/settings/invites'))}
			>
				<Icon name="inbox" size={20} />
				<span class="nav-row-text">
					<span class="nav-row-title">Invites</span>
					<span class="nav-row-sub"
						>{invitations.inbox.length > 0
							? invitations.inbox.length + ' pending'
							: 'No pending invites'}</span
					>
				</span>
				{#if invitations.inbox.length > 0}
					<span class="nav-row-count">{invitations.inbox.length}</span>
				{/if}
				<Icon name="chevron-right" size={18} />
			</Button>
			<Button
				variant="text"
				tone="ink"
				size="md"
				data-test="settings-privacy"
				onclick={() => goto(resolve('/settings/privacy'))}
			>
				<Icon name="shield" size={20} />
				<span class="nav-row-text">
					<span class="nav-row-title">Privacy</span>
					<span class="nav-row-sub">Who can invite you · circle · blocked</span>
				</span>
				<Icon name="chevron-right" size={18} />
			</Button>
		</section>

		<section class="preference-group">
			<h2>Appearance</h2>
			<div class="theme-grid">
				{#each themes as t (t.value)}
					{@const sel = preferences.theme === t.value}
					<button
						class="theme-option"
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
			<div class="size-card">
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
			<div class="size-preview">
				<div class="preview-label">Preview</div>
				<div class="preview-title" style="font-size: {currentSize.px + 1}px">Bringing Up Baby</div>
				<div class="preview-sub" style="font-size: {currentSize.px - 2}px">
					1938 · screwball · Hawks. Cary Grant + Katharine Hepburn + a leopard.
				</div>
			</div>
		</section>

		<section class="preference-group">
			<h2>Recovery</h2>
			<Button
				variant="text"
				tone="ink"
				size="md"
				data-test="settings-deleted-lists"
				onclick={() => goto(resolve('/settings/deleted-lists'))}
			>
				<Icon name="trash-2" size={20} />
				<span class="nav-row-text">
					<span class="nav-row-title">Deleted lists</span>
					<span class="nav-row-sub">Restore lists you've deleted</span>
				</span>
				<Icon name="chevron-right" size={18} />
			</Button>
		</section>

		<section class="preference-group">
			<h2>Account</h2>
			<Button variant="text" tone="ink" size="md" data-test="signout" onclick={signOut}>
				<Icon name="log-out" size={20} />
				<span class="nav-row-text">
					<span class="nav-row-title">Sign out</span>
				</span>
				<Icon name="chevron-right" size={18} />
			</Button>
		</section>
	</div>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.content {
		flex: 1 1 auto;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.profile-chip-section {
		border-bottom: 1px solid var(--rule);
	}

	.display-name {
		flex: 1;
		text-align: left;
		font-size: 15px;
		font-weight: 600;
		color: var(--ink);
	}

	.skeleton {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 18px;
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

	.preference-group h2 {
		font-size: 11.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--stone);
		padding: 22px 18px 8px;
		margin: 0;
	}

	/* Appearance grid */
	.theme-grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 8px;
		padding: 0 18px;
	}

	.theme-option {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 14px 8px;
		border: 1px solid var(--rule);
		border-radius: 12px;
		background: transparent;
		color: var(--stone);
		font-size: 12.5px;
		font-weight: 500;
		cursor: pointer;
	}

	.theme-option.selected {
		border-color: var(--ink);
		background: var(--paper-alt);
		color: var(--ink);
		font-weight: 600;
	}

	/* Text size card + preview */
	.size-card {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 6px;
		padding: 14px 12px;
		margin: 0 18px;
		border: 1px solid var(--rule);
		border-radius: 12px;
		background: var(--paper-alt);
	}

	.size-option {
		flex: 1;
		text-align: center;
		padding: 8px 0;
		border-radius: 8px;
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

	.size-preview {
		margin: 14px 18px 0;
		padding: 14px;
		border: 1px solid var(--rule);
		border-radius: 12px;
	}

	.preview-label {
		font-size: 11px;
		color: var(--stone);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		margin-bottom: 6px;
	}

	.preview-title {
		font-weight: 600;
		color: var(--ink);
		line-height: 1.3;
	}

	.preview-sub {
		color: var(--stone);
		margin-top: 4px;
		line-height: 1.45;
	}

	.nav-row-text {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.nav-row-title {
		font-size: 15px;
		font-weight: 600;
		color: var(--ink);
	}

	.nav-row-sub {
		font-size: 12px;
		color: var(--stone);
		margin-top: 2px;
	}

	.nav-row-count {
		font-size: 12px;
		color: var(--stone);
		font-weight: 600;
		font-family: monospace;
		margin-right: 4px;
	}
</style>
