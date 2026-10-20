<script lang="ts">
	import { resolve } from '$app/paths';

	// The legal footer shared by the Sign in and Register screens: the privacy
	// notice must be reachable before anyone hands over data.
</script>

<footer class="legal fine">
	<p>Wholly European, private, and law-abiding.</p>

	<p>
		<a href={resolve('/about/imprint')} data-test="legal-imprint-link">Imprint</a>
		<span aria-hidden="true">·</span>
		<a href={resolve('/about/privacy')} data-test="legal-privacy-link">Privacy</a>
		<span aria-hidden="true">·</span>
		<a href={resolve('/about/terms')} data-test="legal-terms-link">Terms</a>
	</p>
</footer>

<style>
	.legal {
		margin-top: 2rem;
		text-align: center;
	}

	.legal a {
		color: var(--stone);
		text-decoration: none;
	}
</style>
