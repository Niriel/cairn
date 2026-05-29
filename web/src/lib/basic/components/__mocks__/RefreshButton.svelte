<script lang="ts">
	let {
		spinning = false,
		onclick,
		...rest
	}: {
		spinning?: boolean;
		onclick?: () => void;
		'data-test'?: string;
	} = $props();
</script>

<button
	type="button"
	data-test={rest['data-test'] ?? 'refresh-btn'}
	aria-label="Refresh"
	disabled={spinning}
	{onclick}
></button>
