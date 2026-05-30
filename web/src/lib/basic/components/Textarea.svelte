<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	type Props = {
		value: string;
		id?: string;
		name?: string;
		placeholder?: string;
		disabled?: boolean;
		required?: boolean;
		autocomplete?: HTMLTextareaAttributes['autocomplete'];
		// minHeight wins over rows when both are provided
		rows?: number;
		minHeight?: string;
		'data-test'?: string;
		oninput?: (e: Event) => void;
		onchange?: (e: Event) => void;
		onblur?: (e: FocusEvent) => void;
		onkeydown?: (e: KeyboardEvent) => void;
	};

	let { value = $bindable(), disabled = false, rows, minHeight, ...rest }: Props = $props();

	const rowsProp = $derived(minHeight ? undefined : rows);
</script>

<textarea
	bind:value
	{disabled}
	rows={rowsProp}
	style:min-height={minHeight}
	style:resize="none"
	{...rest}
></textarea>

<style>
	textarea {
		width: 100%;
		padding: 12px 14px;
		border: 1px solid var(--rule);
		border-radius: 12px;
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		font-size: 16px;
		box-sizing: border-box;
		resize: none;
	}

	textarea:focus {
		outline: none;
		border-color: var(--ink);
	}

	textarea::placeholder {
		color: var(--stone);
	}
</style>
