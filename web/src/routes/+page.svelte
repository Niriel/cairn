<script lang="ts">
	import { resolve } from '$app/paths';

	import CairnWordmark from '$lib/shared/components/CairnWordmark.svelte';
</script>

<h1><CairnWordmark size={36} /></h1>

<p>Signed in. Lists land in step 4. Sign out is in <a href={resolve('/settings')}>Settings</a>.</p>
