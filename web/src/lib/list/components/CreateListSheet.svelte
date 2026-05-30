<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import Label from '$lib/basic/components/Label.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';
	import Textarea from '$lib/basic/components/Textarea.svelte';
	import TextInput from '$lib/basic/components/TextInput.svelte';
	import ButtonPair from '$lib/shared/components/ButtonPair.svelte';
	import { createList } from '$lib/list/model/list';
	import type { List } from '$lib/list/model/list';

	type Props = {
		open: boolean;
		onclose: () => void;
		oncreated: (list: List) => void;
	};

	let { open, onclose, oncreated }: Props = $props();

	let name = $state('');
	let description = $state('');
	let submitting = $state(false);
	let error = $state<string | null>(null);

	async function handleSubmit() {
		submitting = true;
		error = null;
		try {
			const result = await createList(name, description || undefined);
			oncreated(result);
			onclose();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Something went wrong';
		} finally {
			submitting = false;
		}
	}
</script>

<Sheet {open} {onclose}>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			void handleSubmit();
		}}
	>
		<div class="field">
			<Label for="create-list-name">Name</Label>
			<TextInput
				id="create-list-name"
				data-test="create-list-name"
				bind:value={name}
				required
				placeholder="List name"
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Escape') {
						e.preventDefault();
						onclose();
					}
				}}
			/>
		</div>
		<div class="field">
			<Label for="create-list-description">Description</Label>
			<Textarea
				id="create-list-description"
				data-test="create-list-description"
				bind:value={description}
				minHeight="4rem"
				placeholder="Optional"
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Enter' && !e.shiftKey && !submitting) {
						e.preventDefault();
						void handleSubmit();
					} else if (e.key === 'Escape') {
						e.preventDefault();
						onclose();
					}
				}}
			/>
		</div>
		{#if error}
			<p class="hint hint-error" data-test="create-list-error">{error}</p>
		{/if}
		<ButtonPair>
			{#snippet left()}
				<Button type="button" tone="ink" data-test="create-list-cancel" onclick={onclose}
					>Cancel</Button
				>
			{/snippet}
			{#snippet right()}
				<Button type="submit" tone="primary" data-test="create-list-submit" disabled={submitting}
					>Create</Button
				>
			{/snippet}
		</ButtonPair>
	</form>
</Sheet>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
</style>
