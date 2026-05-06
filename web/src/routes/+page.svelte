<script lang="ts">
	type Profile = { id: string; display_name: string; created_at: string };

	let profiles = $state<Profile[] | null>(null);
	let error = $state<string | null>(null);

	async function load() {
		profiles = null;
		error = null;
		try {
			const r = await fetch('/api/profiles');
			if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
			profiles = (await r.json()) as Profile[];
		} catch (e) {
			error = (e as Error).message;
		}
	}

	$effect(() => {
		void load();
	});
</script>

<h1>Cairn — walking skeleton</h1>

<p>
	This page reads <code>/api/profiles</code> via the Vite dev proxy → PostgREST → Postgres. If you see
	names below, the dev stack is wired correctly.
</p>

{#if error}
	<p style="color: crimson">Error: {error}</p>
	<button onclick={load}>Retry</button>
{:else if profiles === null}
	<p>Loading…</p>
{:else if profiles.length === 0}
	<p>No profiles yet — did you run <code>./scripts/seed.sh</code>?</p>
{:else}
	<ul>
		{#each profiles as p (p.id)}
			<li>{p.display_name}</li>
		{/each}
	</ul>
{/if}
