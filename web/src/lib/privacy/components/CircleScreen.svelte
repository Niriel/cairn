<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import Label from '$lib/basic/components/Label.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import Avatar from '$lib/shared/components/Avatar.svelte';
	import Snackbar from '$lib/shared/components/Snackbar.svelte';
	import {
		relationships,
		loadRelationships,
		addCircleByEmail,
		removeFromCircle
	} from '$lib/privacy/state/relationships.svelte';
	import { addedAtLabel } from '$lib/privacy/model/relationship';
	import CircleExplainerSheet from './CircleExplainerSheet.svelte';

	let explainerOpen = $state(false);
	let emailInput = $state('');
	let addError = $state<string | null>(null);
	let snackbarOpen = $state(false);

	$effect(() => {
		if (!relationships.loaded) void loadRelationships();
	});

	async function handleAdd() {
		addError = null;
		snackbarOpen = false;
		const result = await addCircleByEmail(emailInput);
		if (result.ok) {
			emailInput = '';
		} else if (result.reason === 'no-such-user') {
			addError = "This e-mail isn't on Cairn — invite them to a list instead.";
		} else if (result.reason === 'self') {
			addError = "That's your own e-mail address.";
		} else {
			snackbarOpen = true;
		}
	}
</script>

<div class="screen" data-test="circle-screen">
	<AppTopBar>Your circle</AppTopBar>

	<div class="screen-body">
		<div class="intro">
			<p class="intro-text caption">
				When your privacy is set to <em>Your circle</em>, these are the only people who can invite
				you to a list.
			</p>
			<div class="whats-this">
				<Button variant="link" data-test="whats-this" onclick={() => (explainerOpen = true)}
					>What's this?</Button
				>
			</div>
		</div>

		{#if relationships.loaded}
			<section data-test="circle-list">
				<h2 class="section-header">People in your circle · {relationships.circle.length}</h2>
				{#if relationships.circle.length > 0}
					<ul class="circle-list rows">
						{#each relationships.circle as entry (entry.otherUserId)}
							<li class="row media" data-test="circle-row-{entry.otherUserId}">
								<Avatar
									displayName={entry.displayName}
									uid={entry.otherUserId}
									avatarVersion={entry.avatarVersion}
									size={36}
								/>
								<div class="row-text">
									<h3 class="display-name">{entry.displayName}</h3>
									<span class="sub caption">{addedAtLabel(entry.createdAt)}</span>
								</div>
								<Button
									variant="pill"
									tone="destructive"
									size="sm"
									data-test="remove-{entry.otherUserId}"
									onclick={() => void removeFromCircle(entry.otherUserId)}>Remove</Button
								>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<div class="add-card card-dashed">
			<div class="field">
				<Label for="circle-add-input">E-mail address</Label>
				<div class="add-input-row">
					<div class="add-input-wrap">
						<TextInput
							id="circle-add-input"
							data-test="circle-add-input"
							type="email"
							autocomplete="email"
							inputmode="email"
							placeholder="friend@example.net"
							bind:value={emailInput}
						/>
					</div>
					<Button variant="rect" tone="ink" data-test="circle-add-btn" onclick={handleAdd}
						>Add</Button
					>
				</div>
			</div>
			{#if addError}
				<p class="hint hint-error" data-test="circle-add-error">{addError}</p>
			{/if}
			<p class="explainer add-hint">
				They'll be added to your circle. If they have you blocked, the add still succeeds on your
				side — but their side stays untouched.
			</p>
		</div>
	</div>
</div>

<Snackbar
	open={snackbarOpen}
	message="Couldn't add to circle"
	data-test="circle-snackbar"
	onclose={() => (snackbarOpen = false)}
/>

<CircleExplainerSheet open={explainerOpen} onclose={() => (explainerOpen = false)} />

<style>
	.intro {
		padding: 0.875rem 1.125rem 0.375rem;
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
	}

	.intro-text {
		flex: 1;
		margin: 0;
	}

	.whats-this {
		flex-shrink: 0;
		margin-top: 1px;
	}

	.section-header {
		padding: 0.5rem 1.125rem;
	}

	.row {
		padding: 0.875rem 1.125rem;
	}

	.row-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.sub {
		margin-top: 0.125rem;
	}

	.add-card {
		margin: 0.875rem 1.125rem 1.5rem;
		padding: 0.875rem;
	}

	.add-input-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.add-input-wrap {
		flex: 1;
	}

	.add-hint {
		margin-top: 0.625rem;
		margin-bottom: 0;
	}
</style>
