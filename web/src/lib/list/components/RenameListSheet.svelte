<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '$lib/basic/components/Button.svelte';
	import Label from '$lib/basic/components/Label.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';
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
	<div class="field">
		<Label for="rename-list-name">Name</Label>
		<TextInput
			id="rename-list-name"
			data-test="rename-list-name"
			bind:value={name}
			placeholder="List name"
			onkeydown={(e: KeyboardEvent) => {
				if (e.key === 'Enter' && !submitting) {
					e.preventDefault();
					void handleSave();
				} else if (e.key === 'Escape') {
					e.preventDefault();
					onclose();
				}
			}}
		/>
	</div>
	{#if error}
		<p class="hint hint-error" data-test="rename-list-error">{error}</p>
	{/if}
	<div class="actions">
		<Button type="button" tone="ink" data-test="rename-list-cancel" onclick={onclose}>Cancel</Button
		>
		<Button
			type="button"
			tone="primary"
			data-test="rename-list-save"
			disabled={submitting}
			onclick={() => void handleSave()}>Save</Button
		>
	</div>
</Sheet>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.actions {
		display: flex;
		gap: 10px;
		margin-top: 12px;
	}

	.actions :global(button) {
		flex: 1;
	}
</style>
