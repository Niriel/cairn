<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		for?: string;
		children: Snippet;
		'data-test'?: string;
	};

	let { for: htmlFor, children, ...rest }: Props = $props();
</script>

<label for={htmlFor} {...rest}>
	{@render children()}
</label>

<style>
	label {
		font-size: 12px;
		color: var(--stone);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
</style>
