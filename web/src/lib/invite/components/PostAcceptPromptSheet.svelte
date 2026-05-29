<script lang="ts">
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import ButtonPair from '$lib/shared/components/ButtonPair.svelte';
	import { addCircleById, relationships } from '$lib/privacy/state/relationships.svelte';
	import { invitations } from '$lib/invite/state/invitations.svelte';

	const entry = $derived([...invitations.postAcceptPrompts][0]);

	$effect(() => {
		if (!entry) return;
		if (relationships.circle.some((c) => c.otherUserId === entry.inviterUid)) {
			invitations.postAcceptPrompts.delete(entry);
		}
	});

	function dismiss() {
		if (entry) invitations.postAcceptPrompts.delete(entry);
	}

	async function addToCircle() {
		// Snapshot the derived before awaiting: addCircleById's relationship
		// write triggers the cleanup $effect above, which deletes the entry
		// and tears down this component. Reading `entry` after the await would
		// touch a derived belonging to a destroyed effect (derived_inert).
		const current = entry;
		if (!current) return;
		await addCircleById(current.inviterUid);
		invitations.postAcceptPrompts.delete(current);
	}
</script>

<Sheet open={true} onclose={dismiss} data-test="post-accept-prompt">
	<p>You accepted {entry?.inviterName}'s invite. Add {entry?.inviterName} to your circle?</p>
	<ButtonPair>
		{#snippet left()}
			<button data-test="post-accept-not-now" onclick={dismiss}>Not now</button>
		{/snippet}
		{#snippet right()}
			<button data-test="post-accept-add-to-circle" onclick={() => void addToCircle()}
				>Add to circle</button
			>
		{/snippet}
	</ButtonPair>
</Sheet>
