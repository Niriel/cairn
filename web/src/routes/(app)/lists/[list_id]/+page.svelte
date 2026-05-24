<script lang="ts">
	import type { PageProps } from './$types';
	import ItemsScreen from '$lib/item/components/ItemsScreen.svelte';

	const { params }: PageProps = $props();
</script>

<ItemsScreen listId={params.list_id} />
