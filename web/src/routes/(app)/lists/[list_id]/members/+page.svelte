<script lang="ts">
	import type { PageProps } from './$types';
	import MembersScreen from '$lib/list/components/MembersScreen.svelte';

	const { params }: PageProps = $props();
</script>

<MembersScreen listId={params.list_id} />
