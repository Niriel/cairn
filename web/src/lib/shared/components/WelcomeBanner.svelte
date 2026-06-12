<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import { profile } from '$lib/shared/state/profile.svelte';

	// 'New user' is the default name set by the tg_profile_on_signup trigger
	// (db/migrations/0004_domain_schema.sql). The banner self-clears once the
	// user picks any other name — no dismiss control needed.
</script>

{#if profile.displayName === 'New user'}
	<div class="banner card-alt" data-test="welcome-banner">
		<h3>Welcome to Cairn!</h3>
		<p class="body">Set your name and a profile picture so friends recognise you.</p>
		<Button
			variant="text"
			tone="ink"
			size="md"
			data-test="welcome-banner-edit"
			onclick={() => void goto(resolve('/profile'))}
		>
			<span class="edit-text">Edit profile</span>
			<Icon name="chevron-right" size={18} />
		</Button>
	</div>
{/if}

<style>
	.banner {
		margin: 0.5rem 1.125rem 0.875rem;
		padding: 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.edit-text {
		flex: 1;
	}
</style>
