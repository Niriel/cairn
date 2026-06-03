<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import Snackbar from '$lib/shared/components/Snackbar.svelte';
	import { relationships, loadRelationships } from '$lib/privacy/state/relationships.svelte';
	import {
		userSettings,
		loadUserSettings,
		setInvitePolicy
	} from '$lib/privacy/state/user-settings.svelte';
	import CircleExplainerSheet from './CircleExplainerSheet.svelte';

	type InvitePolicy = 'everybody' | 'circle' | 'nobody';

	const opts: { k: InvitePolicy; label: string; sub: string }[] = [
		{ k: 'everybody', label: 'Everybody', sub: 'Anyone with a Cairn account' },
		{ k: 'circle', label: 'Your circle', sub: 'Only people in your circle' },
		{ k: 'nobody', label: 'Nobody', sub: 'You can still create lists and invite others' }
	];

	let explainerOpen = $state(false);
	let snackbarOpen = $state(false);
	let cascadeNote = $state('');
	// pendingPolicy tracks the visually selected option before the PATCH resolves
	let pendingPolicy = $state<InvitePolicy | null>(null);

	$effect(() => {
		if (!userSettings.loaded) void loadUserSettings();
	});

	$effect(() => {
		if (!relationships.loaded) void loadRelationships();
	});

	// The displayed selection is pendingPolicy while waiting, else the saved value
	const displayPolicy = $derived(pendingPolicy ?? userSettings.invitePolicy);

	async function handleSelect(next: InvitePolicy) {
		if (!userSettings.loaded) return;
		if (next === userSettings.invitePolicy) return;
		cascadeNote = '';
		pendingPolicy = next;
		try {
			const { prevCount, newCount, tightened } = await setInvitePolicy(next);
			pendingPolicy = null;
			const removed = prevCount - newCount;
			if (removed > 0 && tightened) {
				cascadeNote =
					removed === 1
						? '1 pending invite has been declined to match your new setting.'
						: `${removed} pending invites have been declined to match your new setting.`;
			}
		} catch {
			pendingPolicy = null;
			cascadeNote = '';
			snackbarOpen = true;
		}
	}
</script>

<div class="screen" data-test="privacy-screen">
	<AppTopBar>Privacy</AppTopBar>

	<div class="content">
		<section class="section">
			<h2 class="section-label">Who can invite you to lists</h2>
			<div
				class="segmented-control card"
				role="radiogroup"
				aria-label="Who can invite you to lists"
			>
				{#each opts as opt (opt.k)}
					{@const isSelected = (displayPolicy ?? userSettings.invitePolicy) === opt.k}
					<button
						class="option"
						class:selected={isSelected}
						role="radio"
						aria-checked={isSelected ? 'true' : 'false'}
						data-test="policy-{opt.k}"
						disabled={!userSettings.loaded}
						onclick={() => void handleSelect(opt.k)}
					>
						<span class="radio-dot" class:active={isSelected}>
							{#if isSelected}<span class="dot-fill"></span>{/if}
						</span>
						<span class="option-text">
							<span class="option-title row-title">{opt.label}</span>
							<span class="option-sub caption">{opt.sub}</span>
						</span>
					</button>
				{/each}
			</div>

			{#if cascadeNote}
				<footer>
					<p class="cascade-note caption" data-test="cascade-note">{cascadeNote}</p>
				</footer>
			{/if}

			{#if userSettings.invitePolicy === 'circle'}
				<div class="whats-a-circle">
					<Button
						variant="link"
						leadingIcon="info"
						data-test="whats-a-circle"
						onclick={() => (explainerOpen = true)}>What's a circle?</Button
					>
				</div>
			{/if}
		</section>

		<section class="section">
			<h2 class="section-label">People</h2>
			<div class="nav-rows">
				<Button
					variant="text"
					tone="ink"
					size="md"
					data-test="nav-circle"
					onclick={() => void goto(resolve('/settings/circles'))}
				>
					<Icon name="users" size={20} />
					<span class="nav-row-text">
						<span class="nav-row-title row-title">Your circle</span>
						<span class="nav-row-sub caption">People you'll let invite you</span>
					</span>
					{#if relationships.loaded}
						<span class="badge badge-soft" data-test="circle-count"
							>{relationships.circle.length}</span
						>
					{/if}
					<Icon name="chevron-right" size={18} />
				</Button>
				<hr />
				<Button
					variant="text"
					tone="ink"
					size="md"
					data-test="nav-blocked"
					onclick={() => void goto(resolve('/settings/blocked'))}
				>
					<Icon name="slash" size={20} />
					<span class="nav-row-text">
						<span class="nav-row-title row-title">Blocked</span>
						<span class="nav-row-sub caption">People who can never invite you</span>
					</span>
					{#if relationships.loaded}
						<span class="badge badge-soft" data-test="blocked-count"
							>{relationships.blocked.length}</span
						>
					{/if}
					<Icon name="chevron-right" size={18} />
				</Button>
			</div>
		</section>

		<div class="privacy-note" data-test="privacy-note">
			<Icon name="lock" size={16} />
			<span class="disclaimer"
				>Your e-mail address is never shown to other people on Cairn — only your display name and
				avatar.</span
			>
		</div>
	</div>
</div>

<Snackbar
	open={snackbarOpen}
	message="Couldn't update privacy setting"
	data-test="privacy-snackbar"
	onclose={() => (snackbarOpen = false)}
/>

<CircleExplainerSheet open={explainerOpen} onclose={() => (explainerOpen = false)} />

<style>
	.screen {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}

	.content {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.section-label {
		padding: 1.375rem 1.125rem 0.5rem;
	}

	/* .card supplies the border + radius; overflow clips the divided options. */
	.segmented-control {
		margin: 0 1.125rem;
		overflow: hidden;
	}

	.option {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem;
		width: 100%;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--rule);
		cursor: pointer;
		font-family: inherit;
		text-align: left;
	}

	.option:last-child {
		border-bottom: none;
	}

	/* Selected is genuine state, not drift — the option tints. */
	.option.selected {
		background: var(--paper-alt);
	}

	.option:disabled {
		cursor: default;
	}

	.radio-dot {
		width: 1.125rem;
		height: 1.125rem;
		border-radius: 99px;
		border: 1.5px solid var(--stone-lt);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.radio-dot.active {
		border-color: var(--ink);
	}

	.dot-fill {
		width: 0.5625rem;
		height: 0.5625rem;
		border-radius: 99px;
		background: var(--ink);
	}

	.option-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.option-sub {
		margin-top: 0.125rem;
	}

	.section {
		display: flex;
		flex-direction: column;
	}

	.cascade-note {
		margin: 0 1.125rem;
	}

	.whats-a-circle {
		margin: 0.75rem 1.125rem 0;
	}

	/* Full-bleed top/bottom rules band the nav-row group — single-instance
	   hairline chrome (NavRow extraction is a separate plan). */
	.nav-rows {
		margin: 0;
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
	}

	.nav-row-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.nav-row-sub {
		margin-top: 0.125rem;
	}

	.privacy-note {
		margin: 0 1.125rem 1.5rem;
		padding: 0.875rem;
		background: var(--paper-alt);
		border-radius: 0.75rem;
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
	}
</style>
