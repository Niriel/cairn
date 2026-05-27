<script lang="ts">
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import { pgPatch } from '$lib/shared/http/postgrest';
	import { refreshLists } from '$lib/list/state/lists.svelte';

	type Props = {
		listId: string;
		currentDescription: string | null;
		onclose: () => void;
	};

	let { listId, currentDescription, onclose }: Props = $props();

	let description = $state(currentDescription ?? '');
	let submitting = $state(false);
	let error = $state<string | null>(null);

	async function handleSave() {
		const trimmed = description.trim();
		submitting = true;
		error = null;
		try {
			await pgPatch(`/lists?id=eq.${listId}`, {
				description: trimmed === '' ? null : trimmed
			});
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
	<textarea
		data-test="edit-description-textarea"
		bind:value={description}
		placeholder="Description (optional)"
	></textarea>
	{#if error}
		<p data-test="edit-description-error">{error}</p>
	{/if}
	<div class="actions">
		<button type="button" class="btn-cancel" data-test="edit-description-cancel" onclick={onclose}
			>Cancel</button
		>
		<button
			type="button"
			class="btn-save"
			data-test="edit-description-save"
			disabled={submitting}
			onclick={() => void handleSave()}>Save</button
		>
	</div>
</Sheet>

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
		min-height: 4rem;
		resize: none;
	}

	textarea::placeholder {
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
