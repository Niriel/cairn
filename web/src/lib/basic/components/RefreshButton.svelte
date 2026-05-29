<script lang="ts">
	import Icon from './Icon.svelte';

	let {
		spinning = false,
		onclick,
		...rest
	}: {
		spinning?: boolean;
		onclick?: () => void;
		'data-test'?: string;
	} = $props();
</script>

<button
	class="refresh-btn"
	class:spinning
	disabled={spinning}
	aria-label="Refresh"
	data-test={rest['data-test'] ?? 'refresh-btn'}
	{onclick}
>
	<span class="icon-wrap" class:spin={spinning}>
		<Icon name="rotate-ccw" size={22} />
	</span>
</button>

<style>
	.refresh-btn {
		background: none;
		border: none;
		padding: 4px;
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.refresh-btn:disabled {
		cursor: default;
	}

	.icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-wrap.spin {
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(-360deg);
		}
	}
</style>
