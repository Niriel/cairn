<script lang="ts">
	import type { PageProps } from './$types';
	import TrashScreen from '$lib/item/components/TrashScreen.svelte';

	const { params }: PageProps = $props();
</script>

<TrashScreen listId={params.list_id} />
