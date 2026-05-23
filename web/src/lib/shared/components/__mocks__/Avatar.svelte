<script lang="ts">
	type Props = {
		displayName: string;
		size?: number;
		'data-test'?: string;
	};

	let { displayName, ...rest }: Props = $props();
</script>

<span data-test={rest['data-test']}>{displayName}</span>
