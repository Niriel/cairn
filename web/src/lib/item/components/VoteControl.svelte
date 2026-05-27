<script lang="ts">
	import Icon from '$lib/basic/components/Icon.svelte';

	type Props = {
		value: number | null;
		onchange: (v: number | null) => void;
		disabled?: boolean;
	};

	let { value, onchange, disabled = false }: Props = $props();

	function indicator(v: number | null): string {
		if (v === null || v === 0) return '0';
		const sym = v > 0 ? '+' : '-';
		return sym.repeat(Math.abs(v));
	}

	function letterSpacing(v: number | null): string {
		return v === null || v === 0 ? '0' : '-0.04em';
	}

	function indicatorColor(v: number | null): string {
		if (v === null || v === 0) return 'var(--stone)';
		return v > 0 ? 'var(--sage)' : 'var(--ember)';
	}

	// Non-delegated action: fires stopPropagation synchronously during bubble,
	// before the event reaches any parent. Svelte delegation requires event to
	// reach the document root, which stopPropagation would prevent — so we handle
	// click entirely here, outside Svelte delegation.
	function thumbStyle(dir: 1 | -1): string {
		const atLimit = (dir === 1 && value === 3) || (dir === -1 && value === -3);
		const dim = disabled || atLimit;
		return `width: 36px; height: 36px; border: none; background: transparent; border-radius: 10px;
			color: var(--ink-soft); cursor: ${dim ? 'default' : 'pointer'}; opacity: ${dim ? 0.35 : 1};
			display: flex; align-items: center; justify-content: center;`;
	}

	function thumbButton(node: HTMLButtonElement, dir: 1 | -1) {
		function handler(e: MouseEvent) {
			e.stopPropagation();
			const isAtLimit = (dir === 1 && value === 3) || (dir === -1 && value === -3);
			if (disabled || isAtLimit) return;
			let next: number | null;
			if (value === null) {
				next = dir === 1 ? 1 : -1;
			} else if (Math.abs(value) === 1 && dir === -Math.sign(value)) {
				next = null;
			} else {
				next = value + dir;
			}
			onchange(next);
		}
		node.addEventListener('click', handler);
		return {
			destroy() {
				node.removeEventListener('click', handler);
			}
		};
	}
</script>

<div style="display: inline-flex; align-items: center; gap: 2px;">
	<button
		use:thumbButton={-1}
		data-test="vote-down"
		style={thumbStyle(-1)}
		aria-disabled={disabled || value === -3}
	>
		<Icon name="thumbs-down" size={18} />
	</button>

	<span
		data-test="vote-indicator"
		style="min-width: 44px; text-align: center;
			font-family: 'JetBrains Mono', ui-monospace, monospace;
			font-size: 16px; font-weight: 600;
			color: {indicatorColor(value)};
			letter-spacing: {letterSpacing(value)};
			display: inline-flex; justify-content: center; align-items: center;">{indicator(value)}</span
	>

	<button
		use:thumbButton={1}
		data-test="vote-up"
		style={thumbStyle(1)}
		aria-disabled={disabled || value === 3}
	>
		<Icon name="thumbs-up" size={18} />
	</button>
</div>
