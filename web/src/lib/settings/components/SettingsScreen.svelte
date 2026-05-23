<script lang="ts">
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import TopBar from '$lib/shared/components/TopBar.svelte';
	import Button from '$lib/basic/components/Button.svelte';
	import { profile } from '$lib/shared/state/profile.svelte';
	import { preferences } from '$lib/shared/state/preferences.svelte';
	import type { FontSize, Theme } from '$lib/shared/state/preferences.svelte';
	import { signOut } from '$lib/shared/state/session.svelte';

	const themes: { value: Theme; label: string }[] = [
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' },
		{ value: 'system', label: 'System' }
	];

	const fontSizes: { value: FontSize; label: string }[] = [
		{ value: 'xs', label: 'XS' },
		{ value: 's', label: 'S' },
		{ value: 'm', label: 'M' },
		{ value: 'l', label: 'L' },
		{ value: 'xl', label: 'XL' }
	];
</script>

<div class="screen">
	<TopBar showBack={false}>Settings</TopBar>

	<div class="content">
		<section class="profile-chip">
			{#if profile.displayName === null}
				<div data-test="profile-chip-skeleton" class="skeleton">
					<div class="skeleton-avatar"></div>
					<div class="skeleton-name"></div>
				</div>
			{:else}
				<Avatar displayName={profile.displayName} size={44} data-test="profile-avatar" />
				<span class="display-name">{profile.displayName}</span>
			{/if}
		</section>

		<section class="preference-group">
			<h2>Theme</h2>
			<div class="button-row">
				{#each themes as t (t.value)}
					<Button
						variant={preferences.theme === t.value ? 'primary' : 'ghost'}
						aria-pressed={preferences.theme === t.value}
						data-test="theme-{t.value}"
						onclick={() => (preferences.theme = t.value)}>{t.label}</Button
					>
				{/each}
			</div>
		</section>

		<section class="preference-group">
			<h2>Text size</h2>
			<div class="button-row">
				{#each fontSizes as f (f.value)}
					<Button
						variant={preferences.fontSize === f.value ? 'primary' : 'ghost'}
						aria-pressed={preferences.fontSize === f.value}
						data-test="fontsize-{f.value}"
						onclick={() => (preferences.fontSize = f.value)}>{f.label}</Button
					>
				{/each}
			</div>
		</section>

		<section class="signout-section">
			<Button variant="ghost" data-test="signout" onclick={signOut}>Sign out</Button>
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
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.profile-chip {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.display-name {
		font-weight: 600;
	}

	.skeleton {
		display: flex;
		align-items: center;
		gap: 0.75rem;
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

	.preference-group h2 {
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ink-secondary, #666);
		margin-bottom: 0.5rem;
	}

	.button-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.signout-section {
		margin-top: auto;
	}
</style>
