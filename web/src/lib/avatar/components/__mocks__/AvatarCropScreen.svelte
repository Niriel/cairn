<script lang="ts">
	let { oncancel, onsave }: { oncancel: () => void; onsave: (blob: Blob | null) => void } =
		$props();
</script>

<div data-test="avatar-crop-screen">
	<button data-test="crop-cancel" onclick={oncancel}>Cancel</button>
	<button data-test="crop-save" onclick={() => onsave(new Blob([], { type: 'image/jpeg' }))}
		>Save</button
	>
</div>
