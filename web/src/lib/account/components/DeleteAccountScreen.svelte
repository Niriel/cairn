<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';
	import { CSRF_HEADER } from '$lib/shared/model/auth-paths';
	import { bearerWrite } from '$lib/shared/http/bearer-write';
	import { ApiError, pgPost } from '$lib/shared/http/postgrest';
	import { AUTH_BASE, signOut } from '$lib/shared/state/session.svelte';

	let typed = $state('');
	let deleting = $state(false);
	let done = $state(false);
	let errorMsg = $state('');

	// Low bar, but high enough that no one taps through by accident.
	const confirmed = $derived(typed.trim() === 'delete');

	async function handleDelete() {
		if (!confirmed || deleting) return;
		deleting = true;
		errorMsg = '';
		try {
			// 1. The atomic server-side teardown. Source of truth.
			await pgPost('/rpc/delete_account', {});
		} catch (err) {
			// On any RPC error, surface it and leave the user signed in.
			errorMsg = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
			deleting = false;
			return;
		}
		// 2. Best-effort sidecar avatar unlink — the one side-effect the RPC's
		//    transaction can't perform. Fire-and-forget; the nightly orphan-sweep
		//    reclaims the file if this never lands (see avatars.md).
		void bearerWrite('/avatars/me', { method: 'DELETE' }).catch(() => {});
		// 3. Clear the session cookies. The auth row is already gone, so the JWT is
		//    void; we keep the session store signed-in here so the confirmation
		//    view renders inside the app shell. "Back to sign in" calls signOut(),
		//    which re-POSTs /auth/signout, flips the store, and lets the root guard
		//    redirect to /auth/login.
		try {
			await fetch(`${AUTH_BASE}/signout`, {
				method: 'POST',
				credentials: 'same-origin',
				headers: { [CSRF_HEADER]: '1' }
			});
		} catch {
			// Ignore — signOut() re-POSTs /auth/signout on the way out.
		}
		// 4. Show the confirmation view.
		done = true;
	}
</script>

<div class="screen" data-test="delete-account-screen">
	<AppTopBar>Delete account</AppTopBar>

	<div class="screen-body">
		{#if done}
			<div class="done" data-test="delete-account-done">
				<h2>Your account has been deleted.</h2>
				<p class="body">There's nothing left to do here. Thank you for trying Cairn.</p>
				<Button
					variant="rect"
					tone="ink"
					data-test="delete-account-signout"
					style="width: 100%"
					onclick={signOut}
				>
					Back to sign in
				</Button>
			</div>
		{:else}
			<h2 class="t-hero hero">Delete your Cairn account?</h2>
			<p class="subtitle">We won't ask why. Read what happens, then decide.</p>

			<!-- Courtesy nudge: offer a data copy before the irreversible action. -->
			<div class="export-card card-alt">
				<div class="export-head">
					<Icon name="download" size={24} />
					<div class="export-text">
						<p class="export-title">Want a copy of your data first?</p>
						<p class="caption">A few seconds. Yours to keep, even after deletion.</p>
					</div>
				</div>
				<Button
					variant="pill"
					tone="sage"
					size="sm"
					leadingIcon="download"
					data-test="delete-account-export-download"
					style="width: 100%"
					onclick={() => goto(resolve('/settings/data-export'))}
				>
					Download
				</Button>
			</div>

			<section class="block">
				<h2>What's permanently removed</h2>
				<p class="body">
					Your e-mail, your profile, and every vote you've cast on any list. None of it can be
					recovered.
				</p>
			</section>

			<section class="block">
				<h2>What stays on shared lists</h2>
				<p class="body">
					Items you added on lists you share with other people stay where they are — the people you
					share with need that material to keep using those lists. Your name on those items changes
					to <strong>Deleted user</strong>.
				</p>
			</section>

			<section class="block">
				<h2>What's deleted with your account</h2>
				<p class="body">
					Lists where you were the only remaining member, along with everything on them. Nothing of
					yours is left in someone else's space.
				</p>
			</section>

			<div class="gate card-alt">
				<p class="caption gate-prompt">
					Type <span class="mono gate-word">delete</span> to confirm.
				</p>
				<TextInput
					bind:value={typed}
					placeholder="delete"
					autocomplete="off"
					data-test="delete-account-input"
				/>
			</div>

			{#if errorMsg}
				<p class="hint hint-error" data-test="delete-account-error">{errorMsg}</p>
			{/if}

			<p class="disclaimer undo-note">This can't be undone.</p>
			<Button
				variant="rect"
				tone="destructive"
				leadingIcon="trash"
				disabled={!confirmed || deleting}
				data-test="delete-account-confirm"
				style="width: 100%"
				onclick={handleDelete}
			>
				Delete my account
			</Button>
		{/if}
	</div>
</div>

<style>
	.screen-body {
		padding: 0.875rem 1.25rem;
	}

	.hero {
		margin-bottom: 0.375rem;
	}

	/* Editorial subtitle: serif italic, muted. Colour is the .caption token via
	   --stone; the serif/italic is this screen's voice, kept local. */
	.subtitle {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-style: italic;
		color: var(--stone);
		line-height: 1.5;
		margin: 0 0 1.375rem;
	}

	.export-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		margin-bottom: 1.25rem;
		color: var(--accent);
	}

	.export-head {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.export-text {
		flex: 1;
		min-width: 0;
	}

	.export-title {
		font-weight: 600;
		color: var(--ink);
		margin: 0 0 0.125rem;
	}

	.block {
		margin-bottom: 1.125rem;
	}

	.block .body {
		margin: 0.375rem 0 0;
	}

	.block strong {
		font-weight: 600;
	}

	.gate {
		padding: 0.875rem;
		margin-top: 0.5rem;
	}

	.gate-prompt {
		margin: 0 0 0.625rem;
	}

	.gate-word {
		font-weight: 700;
		color: var(--ink);
	}

	.undo-note {
		margin-top: 1.375rem;
		margin-bottom: 0.5rem;
	}

	.done {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-top: 2rem;
	}

	.done .body {
		margin: 0 0 0.5rem;
	}
</style>
