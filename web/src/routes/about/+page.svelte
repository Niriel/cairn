<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/basic/components/Icon.svelte';
	import { APP_VERSION, BUILD_DATE, formatBuildLine } from '$lib/legal/model/build-info';
	import { HOSTING_COUNTRY, OPERATOR } from '$lib/legal/model/operator';
	import CairnWordmark from '$lib/shared/components/CairnWordmark.svelte';
	import NavRow from '$lib/shared/components/NavRow.svelte';
	import TopBar from '$lib/shared/components/TopBar.svelte';
	import { ICON_SIZE } from '$lib/shared/model/constants';

	const rows = [
		{
			icon: 'shield',
			title: 'Privacy policy',
			sub: 'What we store and why',
			path: '/about/privacy',
			hook: 'about-privacy'
		},
		{
			icon: 'book-open',
			title: 'Terms of service',
			sub: 'The deal, in plain English',
			path: '/about/terms',
			hook: 'about-terms'
		},
		{
			icon: 'feather',
			title: 'Imprint',
			sub: 'Who runs this',
			path: '/about/imprint',
			hook: 'about-imprint'
		},
		{
			icon: 'star',
			title: 'Open source',
			sub: 'Libraries we use, with thanks',
			path: '/about/open-source',
			hook: 'about-open-source'
		},
		{
			icon: 'mail',
			title: 'Contact',
			sub: 'Bugs, security, data requests',
			path: '/about/contact',
			hook: 'about-contact'
		},
		{
			icon: 'compass',
			title: 'Source code',
			sub: 'Cairn is open source',
			path: '/about/license',
			hook: 'about-license'
		}
	] as const;
</script>

<div class="screen" data-test="about-screen">
	<TopBar>About</TopBar>

	<div class="screen-body">
		<header class="identity">
			<CairnWordmark size={30} />
			<p class="caption"><i>here's the way, you'll like this</i></p>
			<p class="fine version" data-test="about-version">
				{formatBuildLine(APP_VERSION, BUILD_DATE)}
			</p>
		</header>

		<div class="nav-rows">
			{#each rows as row (row.path)}
				<NavRow
					title={row.title}
					sub={row.sub}
					data-test={row.hook}
					onclick={() => goto(resolve(row.path))}
				>
					{#snippet lead()}<Icon name={row.icon} size={ICON_SIZE} />{/snippet}
				</NavRow>
			{/each}
		</div>

		<footer class="fine" data-test="about-footer">
			<i
				>A {OPERATOR.brand} app · made with care in {OPERATOR.town} · hosted in {HOSTING_COUNTRY} · no
				trackers</i
			>
		</footer>
	</div>
</div>

<style>
	.identity {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 1.75rem 1.375rem 1.375rem;
		text-align: center;
	}

	.identity p {
		margin: 0;
	}

	.version {
		margin-top: 0.5rem;
	}

	footer {
		padding: 1.25rem 1.375rem;
		text-align: center;
	}
</style>
