<script lang="ts">
	import TopBar from '$lib/shared/components/TopBar.svelte';
</script>

<div class="screen" data-test="imprint-screen">
	<TopBar>Imprint</TopBar>

	<div class="screen-body">
		<p class="intro caption">
			Information about the operator of this service, provided in accordance with § 5 DDG.
		</p>

		<section>
			<h2>Operator</h2>
			<p class="placeholder" data-test="imprint-operator">
				[Operator name — replace before sharing the URL]
			</p>
		</section>

		<section>
			<h2>Postal address</h2>
			<address class="placeholder" data-test="imprint-address">
				[Street and number]<br />
				[Postcode and town]<br />
				[Country]
			</address>
		</section>

		<section>
			<h2>Contact</h2>
			<p class="placeholder" data-test="imprint-email">[you@example.com]</p>
		</section>
	</div>
</div>

<style>
	.screen-body {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1.125rem;
	}

	.intro {
		margin: 0;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.placeholder {
		margin: 0;
		font-style: normal;
		color: var(--stone);
	}
</style>
