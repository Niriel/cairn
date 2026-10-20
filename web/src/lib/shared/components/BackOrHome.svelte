<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import Icon from '$lib/basic/components/Icon.svelte';
	import IconButton from '$lib/basic/components/IconButton.svelte';
	import { navHistory } from '$lib/shared/state/nav-history.svelte';

	// Plain back while a Cairn page is behind us. Otherwise (a cold load onto a
	// bookmarked or reopened deep URL, or after backing down to that first page)
	// history.back() would leave the app, so the control becomes a Home button
	// to /lists instead — the affordance (icon + label) matches the destination.
	function goBack() {
		if (navHistory.canGoBack) {
			history.back();
		} else {
			void goto(resolve('/lists'));
		}
	}
</script>

<IconButton
	onclick={goBack}
	aria-label={navHistory.canGoBack ? 'Back' : 'Home'}
	data-test="topbar-back"
>
	<Icon name={navHistory.canGoBack ? 'chevron-left' : 'home'} size={22} />
</IconButton>
