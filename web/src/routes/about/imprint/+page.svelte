<script lang="ts">
	import LegalPage from '$lib/legal/components/LegalPage.svelte';
	import { OPERATOR } from '$lib/legal/model/operator';
</script>

<LegalPage title="Imprint" sub="Who runs this" data-test="imprint-screen">
	<p class="lede">Who is behind Cairn, and how to reach them.</p>

	<section>
		<h2>Operator</h2>
		<address data-test="imprint-address">
			{OPERATOR.name}<br />
			{#each OPERATOR.addressLines as line (line)}{line}<br />{/each}
			{OPERATOR.country}
		</address>
	</section>

	<section>
		<h2>Contact</h2>
		<p>
			E-mail: <a href="mailto:{OPERATOR.email}" data-test="imprint-email">{OPERATOR.email}</a>
		</p>
	</section>

	<section>
		<h2>Responsible for content</h2>
		<p>{OPERATOR.name}, address as above.</p>
	</section>

	<p data-test="imprint-brand">{OPERATOR.brand} is the personal label of {OPERATOR.name}.</p>

	<p>
		Cairn is run by a private individual, free of charge and without commercial intent; there is no
		VAT number or trade-register entry.
	</p>
</LegalPage>
