<script lang="ts">
	import Icon from '$lib/basic/components/Icon.svelte';
	import LegalPage from '$lib/legal/components/LegalPage.svelte';
	import { SOURCE_REPO_URL } from '$lib/legal/model/operator';
	import { ICON_SIZE } from '$lib/shared/model/constants';

	const repoLabel = SOURCE_REPO_URL.replace(/^https:\/\//, '');
</script>

<LegalPage title="Source code" sub="Cairn is open source" data-test="license-screen">
	<p>
		Cairn itself is published under the <strong
			>GNU Affero General Public License, version 3 or later</strong
		>
		(AGPL-3.0-or-later). The source — every line that runs on the server and in your browser — is public:
	</p>

	<div class="card-alt repo">
		<Icon name="compass" size={ICON_SIZE} />
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external site (the source repository), not an app route -->
		<a href={SOURCE_REPO_URL} rel="noopener" data-test="license-repo-link">{repoLabel}</a>
	</div>

	<section>
		<h2>What the AGPL means for you</h2>
		<ul>
			<li>You can read the code, run your own copy, and change it.</li>
			<li>
				If you run a modified version as a network service, you must publish your changes — that's
				the difference between the AGPL and the plain GPL.
			</li>
			<li>No warranty. Use it at your own risk.</li>
		</ul>
	</section>

	<section>
		<h2>Why the AGPL and not MIT</h2>
		<p>
			Cairn is a privacy-first product. A permissive licence would let someone take Cairn, run it
			with telemetry bolted on, keep their changes closed, and still call it Cairn — undermining the
			thing that makes it worth building. The AGPL prevents that by requiring derivative network
			services to share their source on the same terms.
		</p>
	</section>
</LegalPage>

<style>
	.repo {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.875rem 1rem;
		margin-block: 0.875rem;
	}
</style>
