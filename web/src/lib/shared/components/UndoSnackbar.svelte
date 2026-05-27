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
		actionLabel="Undo"
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

	/*
	 * Deviation from design JSX (screen 15): the design renders "Undo" as a plain
	 * coloured span. We use a solid primary-style button instead — white pill on
	 * the dark snackbar — so the tap target and affordance are unambiguous.
	 */
	.undo-snackbar-root :global(.action) {
		background: var(--paper);
		color: var(--ink);
		border: none;
		border-radius: 8px;
		padding: 6px 14px;
		font-size: 13px;
		font-weight: 600;
	}
</style>
