<script lang="ts">
	import Button from '$lib/basic/components/Button.svelte';
	import Icon from '$lib/basic/components/Icon.svelte';
	import Sheet from '$lib/basic/components/Sheet.svelte';

	type Props = {
		itemName: string;
		onedit: () => void;
		ondelete: () => void;
		onclose: () => void;
	};

	let { itemName, onedit, ondelete, onclose }: Props = $props();
</script>

<Sheet open={true} {onclose}>
	<div class="sheet-handle"></div>
	<header class="header">
		<h2 class="t-sheet">{itemName}</h2>
	</header>
	<ul class="menu">
		<li>
			<Button variant="text" tone="ink" size="md" data-test="item-overflow-edit" onclick={onedit}>
				<Icon name="pencil" size={18} />
				<span class="body">Edit</span>
			</Button>
		</li>
		<li>
			<Button
				variant="text"
				tone="destructive"
				size="md"
				data-test="item-overflow-delete"
				onclick={ondelete}
			>
				<Icon name="trash" size={18} />
				<span class="body">Delete</span>
			</Button>
		</li>
	</ul>
</Sheet>

<style>
	.header {
		padding: 0 1.375rem 0.875rem;
		border-bottom: 1px solid var(--rule);
	}

	.menu :global(button) {
		padding: 0.875rem 1.375rem;
		gap: 0.875rem;
	}

	/* Full-bleed band: a hairline above the first action and below the last,
	   plus a divider between each adjacent pair. */
	.menu {
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
	}

	.menu > li + li {
		border-top: 1px solid var(--rule);
	}
</style>
