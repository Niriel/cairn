<script lang="ts">
	type Props = {
		deletedName: string;
		onUndo: () => void;
		'data-test'?: string;
	};

	let { deletedName, onUndo, 'data-test': dataTest }: Props = $props();
</script>

<div data-test={dataTest}>
	UndoSnackbar: {deletedName}
	<button data-test={dataTest ? `${dataTest}-undo` : undefined} onclick={onUndo}>UNDO</button>
</div>
