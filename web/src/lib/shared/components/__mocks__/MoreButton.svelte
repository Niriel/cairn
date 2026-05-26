<script lang="ts">
	let {
		'aria-label': ariaLabel,
		onclick,
		...rest
	} = $props<{
		'aria-label'?: string;
		onclick?: () => void;
		[k: string]: unknown;
	}>();
</script>

<button data-test={rest['data-test']} aria-label={ariaLabel} {onclick}>MoreButton</button>
