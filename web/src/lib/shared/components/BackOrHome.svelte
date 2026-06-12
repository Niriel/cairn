<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import Icon from '$lib/basic/components/Icon.svelte';
	import IconButton from '$lib/basic/components/IconButton.svelte';
	import { navHistory } from '$lib/shared/state/nav-history.svelte';

	// With an in-app page behind us, plain back is correct. On a cold load
	// (a reopened tab or a pasted/bookmarked deep URL) there's nothing to go
	// back to, so the control becomes a Home button to /lists instead — the
	// affordance (icon + label) matches the destination.
	const atRoot = $derived(!navHistory.hasInApp);

	function goBack() {
		if (atRoot) {
			void goto(resolve('/lists'));
		} else {
			history.back();
		}
	}
</script>

<IconButton onclick={goBack} aria-label={atRoot ? 'Home' : 'Back'} data-test="topbar-back">
	<Icon name={atRoot ? 'home' : 'chevron-left'} size={22} />
</IconButton>
