<script lang="ts">
	type Props = { open: boolean; onclose: () => void };
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let { open, ..._ }: Props = $props();
</script>

{#if open}<div data-test="install-explainer-sheet"></div>{/if}
