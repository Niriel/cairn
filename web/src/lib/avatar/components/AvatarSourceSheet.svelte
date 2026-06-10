<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';

	type Props = {
		onfile: (file: File) => void;
		oncancel: () => void;
	};

	let { onfile, oncancel }: Props = $props();

	let cameraInput: HTMLInputElement;
	let libraryInput: HTMLInputElement;

	function handleFile(e: Event) {
		const files = (e.target as HTMLInputElement).files;
		if (files?.[0]) onfile(files[0]);
	}
</script>

<Sheet open={true} onclose={oncancel}>
	<div class="sheet-handle"></div>
	<header class="header">
		<h2 class="t-sheet">Profile picture</h2>
		<p class="subtitle caption">
			A photo, doodle, or anything else · JPG, PNG, WebP, or HEIC · up to 8 MB
		</p>
	</header>
	<input
		bind:this={cameraInput}
		type="file"
		accept="image/*"
		capture="user"
		onchange={handleFile}
		class="sr-only"
	/>
	<input
		bind:this={libraryInput}
		type="file"
		accept="image/*"
		onchange={handleFile}
		class="sr-only"
	/>
	<Button variant="text" tone="ink" size="md" onclick={() => cameraInput.click()}>
		<Icon name="camera" size={18} />
		<span>Take photo</span>
	</Button>
	<div class="divider"></div>
	<Button variant="text" tone="ink" size="md" onclick={() => libraryInput.click()}>
		<Icon name="image" size={18} />
		<span>Choose from library</span>
	</Button>
	<div class="divider"></div>
	<Button variant="text" tone="ink" size="md" onclick={oncancel}>
		<Icon name="x" size={18} />
		<span>Cancel</span>
	</Button>
</Sheet>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}

	.header {
		padding: 0 1.375rem 0.875rem;
		border-bottom: 1px solid var(--rule);
	}

	.subtitle {
		margin-top: 0.125rem;
	}

	.divider {
		border-bottom: 1px solid var(--rule);
	}
</style>
