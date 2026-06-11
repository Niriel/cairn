<script lang="ts">
	import AppTopBar from '$lib/shared/components/AppTopBar.svelte';
</script>

<!-- Phase 2 stub: just the chrome so /settings/delete-account resolves and
     svelte-check passes. Phase 3 (task 3.1) builds out the consequences copy,
     the typed `delete` gate, the teardown sequence, and the confirmation view. -->
<div class="screen" data-test="delete-account-screen">
	<AppTopBar>Delete account</AppTopBar>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
</style>
