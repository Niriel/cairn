<script lang="ts">
	type Props = { 'data-test'?: string };
	let { 'data-test': dataTest = 'no-connection' }: Props = $props();
</script>

<div data-test={dataTest}>NoConnectionState</div>
