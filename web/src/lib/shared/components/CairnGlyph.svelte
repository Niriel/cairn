<script lang="ts">
	type Props = {
		size?: number;
		color?: string;
		'data-test'?: string;
	};

	let { size = 22, color, ...rest }: Props = $props();

	let fill = $derived(color ?? 'currentColor');
</script>

<svg width={size} height={size} viewBox="0 0 24 24" style="display: block;" {...rest}>
	<ellipse cx="12" cy="19" rx="9" ry="2.6" {fill} />
	<ellipse cx="11.2" cy="13.5" rx="6.3" ry="2.4" {fill} />
	<ellipse cx="12.6" cy="8.5" rx="3.6" ry="2.0" {fill} />
	<circle cx="12.2" cy="4.6" r="1.1" {fill} />
</svg>
