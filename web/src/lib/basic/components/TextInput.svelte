<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = {
		value: string;
		type?: 'text' | 'email' | 'password';
		id?: string;
		name?: string;
		placeholder?: string;
		disabled?: boolean;
		required?: boolean;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		inputmode?: HTMLInputAttributes['inputmode'];
		maxlength?: number;
		'data-test'?: string;
		oninput?: (e: Event) => void;
		onchange?: (e: Event) => void;
		onblur?: (e: FocusEvent) => void;
		onkeydown?: (e: KeyboardEvent) => void;
	};

	let { value = $bindable(), type = 'text', disabled = false, ...rest }: Props = $props();
</script>

<input bind:value {type} {disabled} {...rest} />

<style>
	input {
		width: 100%;
		padding: 12px 14px;
		border: 1px solid var(--rule);
		border-radius: 12px;
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		font-size: 16px;
		box-sizing: border-box;
	}

	input:focus {
		outline: none;
		border-color: var(--ink);
	}

	input::placeholder {
		color: var(--stone);
	}
</style>
