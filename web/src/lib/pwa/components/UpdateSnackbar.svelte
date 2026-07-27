<script lang="ts">
	import { swUpdate } from '$lib/pwa/state/service-worker.svelte';
	import Snackbar from '$lib/shared/components/Snackbar.svelte';

	// Local so dismiss just hides the prompt: the waiting worker stays and
	// auto-applies on next launch (docs/deployment.md § "Service-worker
	// considerations").
	let open = $state(true);
</script>

<Snackbar
	{open}
	persistent
	message="A new version is available — refresh"
	actionLabel="Refresh"
	onaction={() => swUpdate.applyUpdate()}
	onclose={() => (open = false)}
	data-test="update-snackbar"
/>
