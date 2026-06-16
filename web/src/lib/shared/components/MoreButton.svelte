<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	import Icon from '$lib/basic/components/Icon.svelte';
	import IconButton from '$lib/basic/components/IconButton.svelte';
	import { ICON_SIZE } from '$lib/shared/model/constants';

	type Props = HTMLButtonAttributes & {
		size?: number;
	};

	let { size = ICON_SIZE, ...rest }: Props = $props();
</script>

<IconButton {...rest}><Icon name="more-vertical" {size} /></IconButton>
