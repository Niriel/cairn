<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- swap to resolve('/lists') in task 3.3
		void goto('/lists', { replaceState: true });
	});
</script>
