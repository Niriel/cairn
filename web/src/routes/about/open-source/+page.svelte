<script lang="ts">
	import { asset } from '$app/paths';
	import LegalPage from '$lib/legal/components/LegalPage.svelte';
	import { ATTRIBUTIONS, GROUP_LABELS } from '$lib/legal/model/attributions';
</script>

<LegalPage title="Open source" sub="Standing on shoulders" data-test="open-source-screen">
	<p class="lede">Cairn would not exist without these. Thanks to everyone who works on them.</p>

	{#each Object.entries(GROUP_LABELS) as [group, label] (group)}
		<section>
			<h3>{label}</h3>
			<ul class="rows">
				{#each ATTRIBUTIONS.filter((entry) => entry.group === group) as entry (entry.name)}
					<li class="row media credit">
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external project site, not an app route -->
						<a href={entry.url} rel="noopener">{entry.name}</a>
						<span class="fine">{entry.license}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	<p>
		Full licence texts for everything that ships to your browser are in
		<a
			href={asset('/legal/licenses.txt')}
			data-sveltekit-reload
			data-test="open-source-licenses-link">licenses.txt</a
		>, and on the source repository.
	</p>
</LegalPage>

<style>
	.credit {
		align-items: baseline;
		justify-content: space-between;
		padding-block: 0.75rem;
	}
</style>
