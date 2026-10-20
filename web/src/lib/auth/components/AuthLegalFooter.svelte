<script lang="ts">
	import { resolve } from '$app/paths';

	// The legal footer shared by the Sign in and Register screens: the privacy
	// notice must be reachable before anyone hands over data. `hookPrefix` names
	// the screen, so each link keeps its `<screen>-<page>-link` test hook.
	let { hookPrefix }: { hookPrefix: string } = $props();
</script>

<footer class="legal fine">
	<p>Wholly European, private, and law-abiding.</p>

	<p>
		<a href={resolve('/about/imprint')} data-test="{hookPrefix}-imprint-link">Imprint</a>
		<span aria-hidden="true">·</span>
		<a href={resolve('/about/privacy')} data-test="{hookPrefix}-privacy-link">Privacy</a>
		<span aria-hidden="true">·</span>
		<a href={resolve('/about/terms')} data-test="{hookPrefix}-terms-link">Terms</a>
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
