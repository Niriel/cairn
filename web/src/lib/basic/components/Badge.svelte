<script lang="ts">
	import type { Snippet } from 'svelte';

	type Tone = 'primary' | 'soft' | 'score';
	type Sign = 'positive' | 'negative';

	type Props = {
		tone: Tone;
		sign?: Sign;
		children: Snippet;
		'data-test'?: string;
	};

	let { tone, sign, children, ...rest }: Props = $props();
</script>

<!-- Pill base + tone come from the global .badge* roles (controls.css); no
     scoped visual CSS lives here. A score badge is numeric, so it takes the
     .mono role and a positive/negative sign class for its tonal colour. -->
<span
	class="badge badge-{tone}"
	class:mono={tone === 'score'}
	class:positive={tone === 'score' && sign === 'positive'}
	class:negative={tone === 'score' && sign === 'negative'}
	{...rest}
>
	{@render children()}
</span>
