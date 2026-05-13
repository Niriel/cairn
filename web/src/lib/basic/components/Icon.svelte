<script lang="ts">
	import { ICON_PATHS, type IconName } from '../model/icon-paths';

	type Props = {
		name: IconName;
		size?: number;
		'data-test'?: string;
	};

	let { name, size = 20, ...rest }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	{...rest}
>
	<path d={ICON_PATHS[name]} />
</svg>
