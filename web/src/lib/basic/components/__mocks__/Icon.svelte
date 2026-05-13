<script lang="ts">
	import type { IconName } from '../../model/icon-paths';

	type Props = {
		name: IconName;
		size?: number;
		'data-test'?: string;
	};

	let { name, ...rest }: Props = $props();
</script>

<span data-test={rest['data-test'] ?? name}></span>
