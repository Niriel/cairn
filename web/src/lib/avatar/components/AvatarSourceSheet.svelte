<script lang="ts">
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
	<div class="handle"></div>
	<div class="header">
		<div class="title">Profile picture</div>
		<div class="subtitle">
			A photo, doodle, or anything else · JPG, PNG, WebP, or HEIC · up to 8 MB
		</div>
	</div>
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
	<button class="row" onclick={() => cameraInput.click()}>
		<Icon name="camera" size={18} />
		<span>Take photo</span>
	</button>
	<div class="divider"></div>
	<button class="row" onclick={() => libraryInput.click()}>
		<Icon name="image" size={18} />
		<span>Choose from library</span>
	</button>
	<div class="divider"></div>
	<button class="row cancel" onclick={oncancel}>
		<Icon name="x" size={18} />
		<span>Cancel</span>
	</button>
</Sheet>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}

	.handle {
		width: 36px;
		height: 4px;
		border-radius: 99px;
		background: var(--stone-lt);
		margin: 0 auto 14px;
	}

	.header {
		padding: 0 22px 14px;
		border-bottom: 1px solid var(--rule);
	}

	.title {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 18px;
		font-weight: 500;
		color: var(--ink);
	}

	.subtitle {
		font-size: 12px;
		color: var(--stone);
		margin-top: 2px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 22px;
		width: 100%;
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 15px;
		font-weight: 500;
		color: var(--ink);
		font-family: inherit;
		text-align: left;
	}

	.cancel {
		color: var(--stone);
	}

	.divider {
		border-bottom: 1px solid var(--rule);
	}
</style>
