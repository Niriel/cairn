<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
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
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					e.preventDefault();
					onclose();
				}
			}}
		/>
		<textarea
			data-test="create-list-description"
			bind:value={description}
			placeholder="Description (optional)"
			onkeydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey && !submitting) {
					e.preventDefault();
					void handleSubmit();
				} else if (e.key === 'Escape') {
					e.preventDefault();
					onclose();
				}
			}}
		></textarea>
		{#if error}
			<p data-test="create-list-error">{error}</p>
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

	input,
	textarea {
		width: 100%;
		padding: 12px 14px;
		border: 1px solid var(--rule);
		border-radius: 12px;
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		font-size: 16px;
		resize: none;
	}

	input::placeholder,
	textarea::placeholder {
		color: var(--stone);
	}

	textarea {
		min-height: 4rem;
	}

	p {
		margin: 0;
		font-size: 13px;
		color: var(--ember);
	}
</style>
