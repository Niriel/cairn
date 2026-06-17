<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	import favicon from '$lib/assets/favicon.svg';
	import CairnWordmark from '$lib/shared/components/CairnWordmark.svelte';
	import {
		PUBLIC_AUTH_PATHS,
		SIGNED_IN_REDIRECT_PATHS,
		isSegmentMatch
	} from '$lib/shared/model/auth-paths';
	import { PUBLIC_CONTENT_PATHS } from '$lib/shared/model/public-paths';
	import { bootSession, session } from '$lib/shared/state/session.svelte';
	import '$lib/shared/styles/tokens.css';
	import '$lib/shared/styles/reset.css';
	import '$lib/shared/styles/typography.css';
	import '$lib/shared/styles/layout.css';
	import '$lib/shared/styles/surfaces.css';
	import '$lib/shared/styles/controls.css';
	import '$lib/shared/state/preferences.svelte';

	let { children }: { children: Snippet } = $props();

	// Paths a signed-out visitor may view without being bounced to
	// /auth/signin: the auth-flow pages plus the static public content
	// pages (imprint/legal). Kept as two lists because auth-paths.ts is
	// mirrored in the auth-proxy; see public-paths.ts.
	const signedOutMayView = (pathname: string) =>
		isSegmentMatch(pathname, PUBLIC_AUTH_PATHS) || isSegmentMatch(pathname, PUBLIC_CONTENT_PATHS);

	// Paint-race guard. `$effect` fires AFTER the next paint, so if we
	// only relied on the redirects below, the wrong route's children
	// would mount for one frame before `goto` lands. Three cases need to
	// suppress that flash and show the boot screen instead:
	//   1. status === 'unknown' — bootSession() is still in flight; we
	//      don't yet know which side of the gate the user is on.
	//   2. signed-out on a non-public path — about to redirect to
	//      /auth/signin; without this branch the private route's
	//      children paint once before the redirect.
	//   3. signed-in on a SIGNED_IN_REDIRECT_PATHS page (signin,
	//      register, login, check) — about to redirect to /; without
	//      this branch the user briefly sees a stale auth screen after
	//      setSignedIn flipped the state.
	// /auth/callback is intentionally absent from case 3: the callback
	// page owns its own goto('/'), and letting it render unimpeded
	// keeps the two redirects from racing.
	const showBootScreen = $derived(
		session.current.status === 'unknown' ||
			(session.current.status === 'signed-out' && !signedOutMayView(page.url.pathname)) ||
			(session.current.status === 'signed-in' &&
				isSegmentMatch(page.url.pathname, SIGNED_IN_REDIRECT_PATHS))
	);

	onMount(() => {
		void bootSession();
	});

	$effect(() => {
		if (session.current.status === 'signed-out') {
			if (signedOutMayView(page.url.pathname)) return;
			void goto(resolve('/auth/signin'), { replaceState: true });
			return;
		}
		if (session.current.status === 'signed-in') {
			if (isSegmentMatch(page.url.pathname, SIGNED_IN_REDIRECT_PATHS)) {
				void goto(resolve('/'), { replaceState: true });
			}
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app-shell">
	{#if showBootScreen}
		<div data-test="boot-screen" class="boot-screen">
			<CairnWordmark size={48} />
		</div>
	{:else}
		{@render children()}
	{/if}
</div>

<style>
	/*
	 * --app-max-w (624px, in tokens.css) is a desktop ceiling, not a phone
	 * frame: mobile viewports stay below it and take all the width they get,
	 * while wide screens cap here. Held in px so it does NOT scale with the
	 * user's font-size preference (a rem-based value shrank the usable width
	 * on large-screen phones with small fonts). Per-screen horizontal
	 * padding (e.g. LoginRequest's 28px) stays on the screen so the layout
	 * doesn't double-pad.
	 */
	.app-shell {
		max-width: var(--app-max-w);
		margin-inline: auto;
		/* Paint the app surface over the body backdrop (--paper-alt), so on
		   desktop the shell reads as a distinct column against tinted margins.
		   min-height keeps that surface full-height even when content is short,
		   so the backdrop never bleeds up under a short page. */
		min-height: 100dvh;
		background: var(--paper);
		box-shadow: var(--shell-shadow);
	}
	.boot-screen {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
	}
</style>
