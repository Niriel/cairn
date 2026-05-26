<script lang="ts">
	let { 'aria-label': ariaLabel, ...rest } = $props<{
		'aria-label'?: string;
		[k: string]: unknown;
	}>();
</script>

<button data-test={rest['data-test']} aria-label={ariaLabel}>MoreButton</button>
