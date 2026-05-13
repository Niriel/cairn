<script lang="ts">
	type Props = {
		open: boolean;
		message: string;
		actionLabel?: string;
		onaction?: () => void;
		onclose: () => void;
		'data-test'?: string;
	};

	let { open, message, actionLabel, onaction, ...rest }: Props = $props();
</script>

{#if open}
	<div data-test={rest['data-test']}>
		<span>{message}</span>
		{#if actionLabel}
			<button
				type="button"
				data-test={rest['data-test'] ? `${rest['data-test']}-action` : undefined}
				onclick={() => onaction?.()}
			>
				{actionLabel}
			</button>
		{/if}
	</div>
{/if}
