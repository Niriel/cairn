<script lang="ts">
	import { untrack } from 'svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import { pgPatch } from '$lib/shared/http/postgrest';
	import { refreshLists } from '$lib/list/state/lists.svelte';

	type Props = {
		listId: string;
		currentName: string;
		onclose: () => void;
	};

	let { listId, currentName, onclose }: Props = $props();

	let name = $state(untrack(() => currentName));
	let submitting = $state(false);
	let error = $state<string | null>(null);

	async function handleSave() {
		const trimmed = name.trim();
		if (trimmed === '') {
			error = 'Name is required.';
			return;
		}
		if (trimmed.length > 200) {
			error = 'Name must be 200 characters or fewer.';
			return;
		}
		submitting = true;
		error = null;
		try {
			await pgPatch(`/lists?id=eq.${listId}`, { name: trimmed });
			refreshLists();
			onclose();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Something went wrong.';
		} finally {
			submitting = false;
		}
	}
</script>

<Sheet open={true} {onclose}>
	<input
		data-test="rename-list-name"
		type="text"
		bind:value={name}
		placeholder="List name"
		onkeydown={(e) => {
			if (e.key === 'Enter' && !submitting) {
				e.preventDefault();
				void handleSave();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				onclose();
			}
		}}
	/>
	{#if error}
		<p data-test="rename-list-error">{error}</p>
	{/if}
	<div class="actions">
		<button type="button" class="btn-cancel" data-test="rename-list-cancel" onclick={onclose}
			>Cancel</button
		>
		<button
			type="button"
			class="btn-save"
			data-test="rename-list-save"
			disabled={submitting}
			onclick={() => void handleSave()}>Save</button
		>
	</div>
</Sheet>

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
	}

	input::placeholder {
		color: var(--stone);
	}

	p {
		margin: 0;
		font-size: 13px;
		color: var(--ember);
	}

	.actions {
		display: flex;
		gap: 10px;
		margin-top: 12px;
	}

	.btn-cancel,
	.btn-save {
		flex: 1;
		padding: 12px;
		border-radius: 12px;
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}

	.btn-cancel {
		border: 1px solid var(--rule);
		background: var(--paper);
		color: var(--ink);
	}

	.btn-save {
		border: none;
		background: var(--accent);
		color: var(--paper);
		font-weight: 600;
	}

	.btn-save:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
