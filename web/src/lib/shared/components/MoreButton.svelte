<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	import Icon from '$lib/basic/components/Icon.svelte';
	import IconButton from '$lib/basic/components/IconButton.svelte';

	type Props = HTMLButtonAttributes & {
		size?: number;
	};

	let { size = 22, ...rest }: Props = $props();
</script>

<IconButton {...rest}><Icon name="more-vertical" {size} /></IconButton>
