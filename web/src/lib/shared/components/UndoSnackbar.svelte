<script lang="ts">
	import Icon from '$lib/basic/components/Icon.svelte';

	import Snackbar from './Snackbar.svelte';

	type Props = {
		deletedName: string;
		onUndo: () => void;
		ondismiss: () => void;
		'data-test'?: string;
	};

	let { deletedName, onUndo, ondismiss, 'data-test': dataTest }: Props = $props();
</script>

<div class="undo-snackbar-root">
	<Snackbar
		open={true}
		actionLabel="UNDO"
		onaction={onUndo}
		onclose={ondismiss}
		data-test={dataTest}
	>
		{#snippet leading()}
			<Icon name="trash-2" size={16} />
		{/snippet}
		Deleted <strong style="font-weight:600">{deletedName}</strong>
	</Snackbar>
</div>

<style>
	.undo-snackbar-root :global(div) {
		padding: 12px 14px;
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
	}

	.undo-snackbar-root :global(.action) {
		font-size: 12px;
		padding: 4px 8px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--sage);
	}
</style>
