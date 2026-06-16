<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import { exportState, prepare, download } from '$lib/export/state/export.svelte';
</script>

<!--
  The export hub renders by machine status (docs/data-export.md § flow,
  design/cairn-export-screens.jsx artboards 2-4):
    idle      — explanation + "Prepare my download"
    packaging — a blinking feather + generic progress copy (no live counts)
    ready     — a check, the filename chip, and an explicit Download button
    error     — a recoverable message + "Try again"
  Layout is local; colour/type come from tokens and global classes
  (docs/ui.md → "Where CSS lives").
-->
<div class="screen">
	<AppTopBar>Download my data</AppTopBar>

	<div class="screen-body">
		{#if exportState.status === 'idle'}
			<h1 class="headline">Take everything with you.</h1>
			<p class="lede">
				A single ZIP file. Yours forever. It works completely offline — nothing in it contacts
				Cairn.
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
				<Button data-test="export-prepare" leadingIcon="download" onclick={prepare}>
					Prepare my download
				</Button>
				<p class="hint caption">This may take a few seconds for large accounts.</p>
			</div>
		{:else if exportState.status === 'packaging'}
			<div class="state-center" data-test="export-packaging">
				<div class="disc disc-muted blinking">
					<Icon name="feather" size={36} />
				</div>
				<p class="state-title">Packaging your data…</p>
			</div>
		{:else if exportState.status === 'ready'}
			<div class="state-center">
				<div class="disc disc-sage">
					<Icon name="check" size={36} />
				</div>
				<p class="state-title">Ready</p>
				<p class="state-sub">Your archive is ready to download.</p>

				<div class="filename" data-test="export-filename">
					<Icon name="download" size={16} />
					<span class="filename-text">{exportState.result?.fileName}</span>
				</div>

				<div class="actions">
					<Button data-test="export-download" leadingIcon="download" onclick={download}>
						Download
					</Button>
				</div>

				<p class="notes">
					Open the README.html first — it explains what each file is.<br />
					Your archive is valid until you close this page.
				</p>
			</div>
		{:else if exportState.status === 'error'}
			<div class="state-center">
				<p class="error" role="alert" data-test="export-error">{exportState.error}</p>
				<div class="actions">
					<Button data-test="export-retry" leadingIcon="rotate-ccw" onclick={prepare}>
						Try again
					</Button>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.screen-body {
		padding: 1.25rem 1.375rem;
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

	.hint {
		text-align: center;
		margin-top: 0.625rem;
	}

	/* packaging / ready / error share a centred column. */
	.state-center {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 2.5rem 0.5rem;
	}

	.disc {
		width: 88px;
		height: 88px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1.375rem;
	}

	.disc-muted {
		background: var(--paper-alt);
		color: var(--stone);
	}

	.disc-sage {
		background: var(--sage-bg);
		color: var(--sage);
	}

	.blinking {
		animation: blink 1.2s ease-in-out infinite;
	}

	@keyframes blink {
		50% {
			opacity: 0.3;
		}
	}

	/* Honour reduced-motion: hold the feather steady rather than blinking. */
	@media (prefers-reduced-motion: reduce) {
		.blinking {
			animation: none;
		}
	}

	.state-title {
		font-size: 1.5rem;
	}

	.state-sub {
		margin-top: 0.75rem;
		color: var(--stone);
	}

	.filename {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		margin-top: 1.375rem;
		padding: 0.75rem 0.875rem;
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		background: var(--paper-alt);
		font-family: ui-monospace, monospace;
		font-size: 0.8rem;
		color: var(--stone);
	}

	.filename-text {
		flex: 1;
		text-align: left;
		color: var(--ink);
		word-break: break-all;
	}

	.filename + .actions {
		margin-top: 1.125rem;
	}

	.notes {
		margin-top: 1.125rem;
		font-style: italic;
		color: var(--stone);
		line-height: 1.55;
	}

	.error {
		color: var(--ember);
		margin-bottom: 1rem;
	}
</style>
