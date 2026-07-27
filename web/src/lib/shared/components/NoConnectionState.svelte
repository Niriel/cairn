<script lang="ts">
	import EmptyState from '$lib/shared/components/EmptyState.svelte';

	// Offline empty state for a screen whose data couldn't be fetched and has
	// nothing cached to show. Reuses the "No connection" wording already used by
	// the avatar upload flow, for consistency.
	type Props = { 'data-test'?: string };
	let { 'data-test': dataTest = 'no-connection' }: Props = $props();
</script>

<EmptyState
	data-test={dataTest}
	icon="slash"
	title="No connection"
	body="Cairn couldn't reach the network. Reconnect and try again."
/>
