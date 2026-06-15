<script lang="ts">
	let { onedit, ondelete } = $props<{
		itemName?: string;
		onedit?: () => void;
		ondelete?: () => void;
		onclose?: () => void;
	}>();
</script>

<div data-test="item-overflow-sheet-stub">
	<button data-test="item-overflow-edit" onclick={onedit}>Edit</button>
	<button data-test="item-overflow-delete" onclick={ondelete}>Delete</button>
</div>
