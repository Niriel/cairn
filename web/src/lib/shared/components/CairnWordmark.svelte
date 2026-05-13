<script lang="ts">
	import CairnGlyph from './CairnGlyph.svelte';

	type Props = {
		size?: number;
		'data-test'?: string;
	};

	let { size = 22, ...rest }: Props = $props();
</script>

<span class="wordmark" style="font-size: {size + 4}px; gap: 8px;" {...rest}>
	<CairnGlyph {size} color="var(--accent)" />
	<span>Cairn</span>
</span>

<style>
	.wordmark {
		display: inline-flex;
		align-items: center;
		font-family: 'Newsreader', Georgia, serif;
		font-weight: 500;
		letter-spacing: -0.01em;
		color: var(--ink);
	}
</style>
