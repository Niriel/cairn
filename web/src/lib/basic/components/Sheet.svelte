<script lang="ts" module>
	// Open sheets, oldest first. Sheets nest (e.g. Rename inside the list
	// overflow sheet), and each one listens for Escape on window, so only the
	// topmost may act on it.
	const openSheets: symbol[] = [];
</script>

<script lang="ts">
	import { untrack, type Snippet } from 'svelte';

	import { focusAtEnd } from '../model/focus-at-end';
	import { pushHistoryGuard } from '$lib/shared/state/back-stack.svelte';

	type Props = {
		open: boolean;
		onclose: () => void;
		children?: Snippet;
		'data-test'?: string;
	};

	let { open, onclose, children, ...rest }: Props = $props();

	$effect(() => {
		if (!open) return;
		// untrack: pushHistoryGuard → pushState reads SvelteKit's internal
		// history state, which would otherwise re-track this effect and
		// tear it down on every subsequent navigation (e.g. a goto from
		// the parent), spuriously firing the back-stack guard.
		return untrack(() => pushHistoryGuard(() => onclose()));
	});

	$effect(() => {
		if (!open) return;
		const me = Symbol('sheet');
		openSheets.push(me);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && openSheets.at(-1) === me) onclose();
		};
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			openSheets.splice(openSheets.indexOf(me), 1);
		};
	});

	const TEXT_FIELD =
		'textarea, input:is([type="text"], [type="email"], [type="password"], [type="search"])';

	// Attachment on the sheet panel: on open, focus the first text field (caret
	// at the end) so the keyboard is ready; on close, hand focus back to
	// whatever had it before — usually the button that opened the sheet.
	function manageFocus(panel: HTMLElement) {
		const opener = document.activeElement;
		const field = panel.querySelector<HTMLInputElement | HTMLTextAreaElement>(TEXT_FIELD);
		if (field) focusAtEnd(field);
		return () => {
			// The panel is already detached here, so focus has fallen to body
			// unless something else claimed it (e.g. another sheet opening);
			// don't steal it back in that case.
			const lost = document.activeElement === null || document.activeElement === document.body;
			if (lost && opener instanceof HTMLElement && opener.isConnected) opener.focus();
		};
	}
</script>

{#if open}
	<div class="backdrop" role="presentation" onclick={onclose}></div>
	<div class="sheet" data-test={rest['data-test']} {@attach manageFocus}>
		{@render children?.()}
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		left: max(0px, calc(50% - var(--app-max-w) / 2));
		right: max(0px, calc(50% - var(--app-max-w) / 2));
		top: 0;
		bottom: 0;
	}

	.sheet {
		position: fixed;
		left: max(0px, calc(50% - var(--app-max-w) / 2));
		right: max(0px, calc(50% - var(--app-max-w) / 2));
		bottom: 0;
		max-height: calc(100vh - 2rem - env(safe-area-inset-top));
		display: flex;
		flex-direction: column;
		background: var(--paper);
		padding: 1rem calc(1rem + env(safe-area-inset-right)) calc(1rem + env(safe-area-inset-bottom))
			calc(1rem + env(safe-area-inset-left));
		box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.15);
		border-radius: 24px 24px 0 0;
	}
</style>
