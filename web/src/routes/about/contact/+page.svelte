<script lang="ts">
	import { resolve } from '$app/paths';
	import LegalPage from '$lib/legal/components/LegalPage.svelte';
	import { OPERATOR } from '$lib/legal/model/operator';
</script>

<LegalPage title="Contact" sub="Real humans read these" data-test="contact-screen">
	<p class="lede">One address for everything. We usually answer within a few days.</p>

	<section class="card contact-card">
		<h3>E-mail</h3>
		<p>
			<a href="mailto:{OPERATOR.email}" data-test="contact-email">{OPERATOR.email}</a>
		</p>
		<ul>
			<li>Bugs, questions and feedback — things you wish Cairn did.</li>
			<li>
				<strong>Security</strong>: vulnerabilities, or concerns about how Cairn handles your data.
				We won't pursue legal action against good-faith research.
			</li>
			<li>
				<strong>Privacy and data requests</strong>: most of these can be done in Settings, but if
				something isn't working, write.
			</li>
			<li><strong>Reports of illegal content</strong> on Cairn.</li>
		</ul>
	</section>

	<section class="card contact-card">
		<h3>Postal</h3>
		<p>
			See the <a href={resolve('/about/imprint')} data-test="contact-imprint-link">Imprint</a> for legal
			correspondence.
		</p>
	</section>
</LegalPage>

<style>
	.contact-card {
		padding: 0.875rem 1rem;
		margin-block-end: 0.625rem;
	}

	.contact-card > :first-child {
		margin-block-start: 0;
	}

	.contact-card > :last-child {
		margin-block-end: 0;
	}
</style>
