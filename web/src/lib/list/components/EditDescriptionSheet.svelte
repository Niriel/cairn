<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '$lib/basic/components/Button.svelte';
	import Label from '$lib/basic/components/Label.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import Textarea from '$lib/basic/components/Textarea.svelte';
	import { pgPatch } from '$lib/shared/http/postgrest';
	import { refreshLists } from '$lib/list/state/lists.svelte';

	type Props = {
		listId: string;
		currentDescription: string | null;
		onclose: () => void;
	};

	let { listId, currentDescription, onclose }: Props = $props();

	let description = $state(untrack(() => currentDescription ?? ''));
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
	<div class="field">
		<Label for="edit-description-textarea">Description</Label>
		<Textarea
			id="edit-description-textarea"
			data-test="edit-description-textarea"
			bind:value={description}
			minHeight="4rem"
			placeholder="Optional"
			onkeydown={(e: KeyboardEvent) => {
				if (e.key === 'Enter' && !e.shiftKey && !submitting) {
					e.preventDefault();
					void handleSave();
				}
			}}
		/>
	</div>
	{#if error}
		<p class="hint hint-error" data-test="edit-description-error">{error}</p>
	{/if}
	<div class="actions">
		<Button type="button" tone="ink" data-test="edit-description-cancel" onclick={onclose}
			>Cancel</Button
		>
		<Button
			type="button"
			tone="primary"
			data-test="edit-description-save"
			disabled={submitting}
			onclick={() => void handleSave()}>Save</Button
		>
	</div>
</Sheet>

<style>
	.actions {
		display: flex;
		gap: 10px;
		margin-top: 12px;
	}

	.actions :global(button) {
		flex: 1;
	}
</style>
