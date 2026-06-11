<script lang="ts">
	import type { PageProps } from './$types';

	import { resolve } from '$app/paths';
	import { pgPost } from '$lib/shared/http/postgrest';
	import { timeAgo } from '$lib/shared/model/time-ago';
	import CairnWordmark from '$lib/shared/components/CairnWordmark.svelte';
	import EmptyState from '$lib/shared/components/EmptyState.svelte';
	import Badge from '$lib/basic/components/Badge.svelte';

	// The curated anonymous payload from the public_list_view RPC: no members,
	// votes, or attribution — just the list and its ranked items with scores
	// and each item's created_at (a date, not attribution — when, not who).
	type PublicItem = {
		id: string;
		name: string;
		notes: string | null;
		score: number;
		created_at: string;
	};
	type PublicList = {
		id: string;
		name: string;
		description: string | null;
		items: PublicItem[];
	};

	const { params }: PageProps = $props();

	let status = $state<'loading' | 'ready' | 'unavailable'>('loading');
	let list = $state<PublicList | null>(null);

	$effect(() => {
		const listId = params.list_id;
		pgPost<PublicList | null>('/rpc/public_list_view', { p_id: listId })
			.then((result) => {
				list = result;
				status = result ? 'ready' : 'unavailable';
			})
			// A null result is the unavailable boundary (private / deleted / unknown);
			// a request failure lands in the same generic state — we never reveal why.
			.catch(() => {
				status = 'unavailable';
			});
	});
</script>

<div class="screen" data-test="public-screen">
	<header class="masthead">
		<!-- The wordmark links home: a signed-out reader who lands here is invited
		     to start their own Cairn (home routes them to sign-in/join). -->
		<a
			href={resolve('/')}
			class="home-link"
			data-test="public-home-link"
			aria-label="Cairn — start your own"
		>
			<CairnWordmark size={26} />
		</a>
	</header>

	{#if status === 'loading'}
		<div class="content caption" data-test="public-loading">Loading…</div>
	{:else if status === 'unavailable'}
		<EmptyState
			data-test="public-unavailable"
			icon="slash"
			title="List not available"
			body="This list is private or no longer exists. Ask whoever shared it for an up-to-date link."
		/>
	{:else if list}
		<div class="content" data-test="public-list">
			<h1 class="list-name">{list.name}</h1>
			{#if list.description}
				<p class="list-desc body">{list.description}</p>
			{/if}

			{#if list.items.length > 0}
				<ul class="rows">
					{#each list.items as item (item.id)}
						<li class="row" data-test="public-item-{item.id}">
							<div class="row-top media">
								<span class="item-name row-title">{item.name}</span>
								{#if item.score !== 0}
									<Badge tone="score" sign={item.score > 0 ? 'positive' : 'negative'}>
										{item.score > 0 ? '+' : ''}{item.score}
									</Badge>
								{/if}
							</div>
							{#if item.notes}
								<p class="notes body">{item.notes}</p>
							{/if}
							<p class="added fine" data-test="public-item-added-{item.id}">
								Added {timeAgo(item.created_at)}
							</p>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty-note caption" data-test="public-empty-items">No items yet.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}

	/* Non-app masthead: this page sits outside the (app) shell, so it has no
	   TopBar — just the wordmark, centred, with the same hairline base rule the
	   TopBar uses. */
	.masthead {
		display: flex;
		justify-content: center;
		padding: calc(env(safe-area-inset-top) + 0.875rem) 1.125rem 0.875rem;
		border-bottom: 1px solid var(--rule);
	}

	.home-link {
		display: inline-flex;
		text-decoration: none;
	}

	.content {
		flex: 1;
		padding: 1.125rem;
	}

	.list-name {
		margin: 0;
	}

	.list-desc {
		margin: 0.5rem 0 0;
		color: var(--ink-soft);
	}

	.rows {
		margin-top: 1.25rem;
	}

	.row {
		padding: 0.875rem 0;
		border-bottom: 1px dashed var(--rule);
	}

	.row-top {
		gap: 0.625rem;
	}

	.item-name {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	/* Editorial serif-italic for free-text notes — matches the Items screen. */
	.notes {
		margin: 0.5rem 0 0;
		font-family: 'Newsreader Variable', Georgia, serif;
		font-style: italic;
	}

	.added {
		margin: 0.375rem 0 0;
	}

	.empty-note {
		margin-top: 1.25rem;
	}
</style>
