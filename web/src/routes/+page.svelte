<!--
	Placeholder root page. Step 4 of plans/0000_implementation_order.md
	replaces this entirely with the Lists screen. The Sign Out button
	below is temporary — it lives here so the Task 5.2 Playwright spec
	has a click target until Step 4 moves Sign Out into Settings. The
	real Settings button must inherit the same `data-test="signout"`
	and `variant="ghost"` so the spec selector survives the move.
-->

<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import CairnWordmark from '$lib/shared/components/CairnWordmark.svelte';
	import { signOut } from '$lib/shared/state/session.svelte';
</script>

<h1><CairnWordmark size={36} /></h1>

<p>Signed in. Lists land in step 4.</p>

<!-- TEMPORARY: remove when Step 4 moves Sign Out into Settings. See the
	file header for the full handover note (data-test + variant must
	transfer to the Settings button or the Playwright spec breaks). -->
<Button variant="ghost" data-test="signout" onclick={() => void signOut()}>Sign out</Button>
