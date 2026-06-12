<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import { exportState, prepare, download } from '$lib/export/state/export.svelte';
</script>

<!--
  Minimal export hub: explanation + the single action. The full three-state
  polish (packaging spinner, ready/expiry copy, error recovery) lands in a
  later task; for now an idle → ready toggle and an inline error are enough to
  prepare and download data.json. Layout-only styling here; type/colour come
  from the global rules (docs/ui.md → "Where CSS lives").
-->
<div class="screen">
	<AppTopBar>Download my data</AppTopBar>

	<div class="content">
		<h1 class="headline">Take everything with you.</h1>
		<p class="lede">
			A single ZIP file. Yours forever. It works completely offline — nothing in it contacts Cairn.
		</p>

		<div class="card whats-inside">
			<h2>What's inside</h2>
			<ul>
				<li>Your profile and photo;</li>
				<li>every list you own or belong to;</li>
				<li>every item you added, with notes and votes;</li>
				<li>your invites, your circle, your blocklist.</li>
			</ul>
			<h2>Two formats</h2>
			<dl>
				<dt>HTML</dt>
				<dd>Open in any browser to read.</dd>
				<dt>JSON</dt>
				<dd>Feed it to another tool, or keep as the canonical record.</dd>
			</dl>
		</div>

		<div class="actions">
			{#if exportState.status === 'ready'}
				<Button data-test="export-download" leadingIcon="download" onclick={download}>
					Download
				</Button>
				<p class="hint caption">Your data is ready, click <strong>Download</strong>.</p>
			{:else}
				<Button
					data-test="export-prepare"
					leadingIcon="download"
					disabled={exportState.status === 'packaging'}
					onclick={prepare}
				>
					Prepare my download
				</Button>
				<p class="hint caption">This may take a few seconds for large accounts.</p>
			{/if}
		</div>

		{#if exportState.status === 'error'}
			<p class="error caption" role="alert" data-test="export-error">{exportState.error}</p>
		{/if}
	</div>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.content {
		flex: 1 1 auto;
		overflow-y: auto;
		padding: 1.25rem 1.375rem 1.75rem;
	}

	.headline {
		margin-bottom: 0.375rem;
	}

	.lede {
		font-style: italic;
		color: var(--stone);
		margin-bottom: 1.125rem;
	}

	.whats-inside {
		padding: 0.875rem 1rem;
		margin-bottom: 1.5rem;
		line-height: 1.5em;
	}

	.whats-inside ul,
	.whats-inside dl {
		margin: 0 0 0.875rem;
		padding-left: 1.125rem;
	}

	/* Indent each dd under its dt — the term sits at the list edge, the
	   description steps in beneath it. */
	.whats-inside dd {
		margin-left: 0.875rem;
	}

	.actions {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.hint,
	.error {
		text-align: center;
		margin-top: 0.625rem;
	}

	.error {
		color: var(--ember);
	}
</style>
