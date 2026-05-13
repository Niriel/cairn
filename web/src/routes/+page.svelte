<!--
	Placeholder root page. The real UI — design tokens, theming, layout
	primitives — lands in step 2 of plans/0000_implementation_order.md.
	Anything beyond this static markup will be thrown away when step 2
	starts, so resist the urge to wire up auth or routing here.
-->

<script lang="ts">
	import CairnWordmark from '$lib/shared/components/CairnWordmark.svelte';
</script>

<h1><CairnWordmark size={36} /></h1>

<p>
	Pre-alpha. The web UI lands in step 2 of
	<code>plans/0000_implementation_order.md</code>; the backend (Postgres + PostgREST + GoTrue, Tier
	1+2 schema) is up as of step 1.
</p>

<p>
	Verify the service mesh with <code>./scripts/smoke.sh</code>, the database tests with
	<code>./scripts/test-db.sh</code>, and the full quality gauntlet with
	<code>./scripts/check.sh</code>.
</p>
