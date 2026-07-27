<script lang="ts">
	// Only `disabled` is asserted on; `value`/`onchange` are passed by the screen
	// but ignored here (Svelte drops extra props on a component that doesn't
	// declare them).
	type Props = { disabled?: boolean };
	let { disabled = false }: Props = $props();
</script>

<span data-test="vote-down"></span>
<span data-test="vote-indicator" data-disabled={disabled ? 'true' : undefined}></span>
<span data-test="vote-up"></span>
