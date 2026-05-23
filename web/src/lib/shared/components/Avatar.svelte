<script lang="ts">
	type Props = {
		displayName: string;
		size?: number;
		'data-test'?: string;
	};

	let { displayName, size = 40, ...rest }: Props = $props();

	function initials(name: string): string {
		const trimmed = name.trim();
		if (!trimmed) return '?';
		const words = trimmed.split(/\s+/);
		const first = words[0][0].toUpperCase();
		if (words.length === 1) return first;
		return first + words[words.length - 1][0].toUpperCase();
	}

	function hue(name: string): number {
		let h = 5381;
		for (let i = 0; i < name.length; i++) h = ((h * 33) ^ name.charCodeAt(i)) >>> 0;
		return h % 360;
	}

	const text = $derived(initials(displayName));
	const bg = $derived(`oklch(70% 0.10 ${hue(displayName)}deg)`);
</script>

<span
	data-test={rest['data-test']}
	data-hue={hue(displayName)}
	style="
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		width: {size}px;
		height: {size}px;
		font-size: {size * 0.46}px;
		font-weight: 600;
		color: #fff;
		background: {bg};
		user-select: none;
	">{text}</span
>
