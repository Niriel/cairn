<script lang="ts">
	let {
		open,
		message,
		actionLabel,
		onaction,
		onclose,
		...rest
	}: {
		open: boolean;
		message: string;
		actionLabel?: string;
		onaction?: () => void;
		onclose: () => void;
		['data-test']?: string;
	} = $props();

	$effect(() => {
		if (!open) return;
		const id = setTimeout(() => onclose(), 6000);
		return () => clearTimeout(id);
	});
</script>

{#if open}
	<div data-test={rest['data-test']} role="status">
		<span class="message">{message}</span>
		{#if actionLabel}
			<button
				type="button"
				class="action"
				data-test={rest['data-test'] ? `${rest['data-test']}-action` : undefined}
				onclick={() => onaction?.()}
			>
				{actionLabel}
			</button>
		{/if}
	</div>
{/if}

<style>
	div {
		position: fixed;
		left: 16px;
		right: 16px;
		bottom: var(--snackbar-bottom);
		background: var(--ink);
		color: var(--paper);
		padding: 0.75rem 1rem;
		border-radius: 8px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.message {
		flex: 1 1 auto;
		min-width: 0;
	}

	.action {
		flex: 0 0 auto;
		background: transparent;
		border: none;
		color: var(--paper);
		font: inherit;
		text-transform: uppercase;
		padding: 0 0.5rem;
		cursor: pointer;
	}
</style>
