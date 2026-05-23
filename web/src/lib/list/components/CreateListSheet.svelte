<script lang="ts">
	import Sheet from '$lib/basic/components/Sheet.svelte';
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
		<input
			data-test="create-list-name"
			type="text"
			bind:value={name}
			required
			placeholder="List name"
		/>
		<textarea
			data-test="create-list-description"
			bind:value={description}
			placeholder="Description (optional)"
		></textarea>
		{#if error}
			<p data-test="create-list-error">{error}</p>
		{/if}
		<ButtonPair>
			{#snippet left()}
				<button type="button" data-test="create-list-cancel" onclick={onclose}>Cancel</button>
			{/snippet}
			{#snippet right()}
				<button type="submit" data-test="create-list-submit" disabled={submitting}>Create</button>
			{/snippet}
		</ButtonPair>
	</form>
</Sheet>
