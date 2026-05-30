<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';

	type Props = {
		open: boolean;
		onclose: () => void;
	};

	let { open, onclose }: Props = $props();
</script>

<Sheet {open} {onclose}>
	<h2>What is a circle?</h2>

	<p>
		Your circle is a private list of people you'll let invite you to lists, when your privacy is set
		to <em>Your circle</em>.
	</p>

	<div class="explainer-point">
		<p class="point-title">It's yours alone.</p>
		<p class="point-body">
			Bob doesn't see whether they're in your circle. You don't see whose circle you're in. Each
			person manages their own.
		</p>
	</div>

	<div class="explainer-point">
		<p class="point-title">It only governs invites coming to you.</p>
		<p class="point-body">
			It does not affect your ability to invite anyone. If Bob's policy is also <em>Your circle</em
			>, what matters for inviting Bob is whether <em>you</em> are in <em>their</em> circle — not the
			other way around.
		</p>
	</div>

	<div class="explainer-point">
		<p class="point-title">Adding by e-mail is two-way.</p>
		<p class="point-body">
			If you add Bob's e-mail here, you go on their circle too — unless they've blocked you, in
			which case only your side is updated. Either of you can remove the other at any time.
		</p>
	</div>

	<div class="explainer-point">
		<p class="point-title">To stop someone inviting you: block them.</p>
		<p class="point-body">
			The block always wins — it overrides every circle and policy on either side.
		</p>
	</div>

	<p class="privacy-footer">
		Cairn will never tell anyone whose circle they're in. The list above is yours; you're the only
		one who sees it.
	</p>

	<div class="got-it-wrap">
		<Button variant="rect" tone="ink" size="md" onclick={onclose}>Got it</Button>
	</div>
</Sheet>

<style>
	h2 {
		font-size: 1.6rem;
		font-weight: 500;
		letter-spacing: -0.01em;
		margin-bottom: 0.75rem;
	}

	p {
		font-size: 0.9rem;
		line-height: 1.55;
		margin-bottom: 0.875rem;
	}

	.explainer-point {
		margin-bottom: 0.75rem;
	}

	.point-title {
		font-size: 0.84rem;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.point-body {
		font-size: 0.81rem;
		color: var(--stone);
		margin-bottom: 0;
	}

	.privacy-footer {
		font-size: 0.78rem;
		color: var(--stone);
		padding: 0.75rem 0.875rem;
		background: var(--paper-alt);
		border-radius: 0.625rem;
		margin-top: 1.125rem;
	}

	.got-it-wrap {
		margin-top: 1.125rem;
	}

	.got-it-wrap :global(button) {
		width: 100%;
	}
</style>
