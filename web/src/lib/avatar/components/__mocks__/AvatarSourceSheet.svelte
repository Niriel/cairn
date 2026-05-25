<script lang="ts">
	type Props = {
		onfile: (file: File) => void;
		oncancel: () => void;
	};

	let { onfile, oncancel }: Props = $props();
</script>

<div data-test="avatar-source-sheet">
	<button data-test="avatar-source-camera" onclick={() => {}}>camera</button>
	<button data-test="avatar-source-library" onclick={() => onfile(new File([], 'photo.jpg'))}
		>library</button
	>
	<button data-test="avatar-source-cancel" onclick={oncancel}>cancel</button>
</div>
