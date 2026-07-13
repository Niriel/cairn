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
	<h2 class="t-hero">What is a circle?</h2>

	<p class="intro body">
		Your circle is a private list of people you'll let invite you to lists, when your privacy is set
		to <em>Your circle</em>.
	</p>

	<div class="explainer-point">
		<h3 class="point-title">It's yours alone.</h3>
		<p class="point-body caption">
			Bob doesn't see whether they're in your circle. You don't see whose circle you're in. Each
			person manages their own.
		</p>
	</div>

	<div class="explainer-point">
		<h3 class="point-title">It only governs invites coming to you.</h3>
		<p class="point-body caption">
			It does not affect your ability to invite anyone. If Bob's policy is also <em>Your circle</em
			>, what matters for inviting Bob is whether <em>you</em> are in <em>their</em> circle — not the
			other way around.
		</p>
	</div>

	<div class="explainer-point">
		<h3 class="point-title">Adding by username is two-way.</h3>
		<p class="point-body caption">
			If you add Bob's username here, you go on their circle too — unless they've blocked you, in
			which case only your side is updated. Either of you can remove the other at any time.
		</p>
	</div>

	<div class="explainer-point">
		<h3 class="point-title">To stop someone inviting you: block them.</h3>
		<p class="point-body caption">
			The block always wins — it overrides every circle and policy on either side.
		</p>
	</div>

	<p class="privacy-footer card-alt caption">
		Cairn will never tell anyone whose circle they're in. The list above is yours; you're the only
		one who sees it.
	</p>

	<div class="got-it-wrap">
		<Button variant="rect" tone="ink" size="md" onclick={onclose}>Got it</Button>
	</div>
</Sheet>

<style>
	h2 {
		margin-bottom: 0.75rem;
	}

	.intro {
		margin-bottom: 0.875rem;
	}

	.explainer-point {
		margin-bottom: 0.75rem;
	}

	.point-title {
		margin-bottom: 0.25rem;
	}

	.point-body {
		margin-bottom: 0;
	}

	.privacy-footer {
		padding: 0.75rem 0.875rem;
		margin-top: 1.125rem;
	}

	.got-it-wrap {
		margin-top: 1.125rem;
	}

	.got-it-wrap :global(button) {
		width: 100%;
	}
</style>
