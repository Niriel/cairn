import { describe, expect, test } from 'vitest';

import { render } from '$lib/test/render';

import { ICON_PATHS } from '../model/icon-paths';
import Icon from './Icon.svelte';

describe('Icon', () => {
	test('renders an SVG with a path whose d matches ICON_PATHS[name]', () => {
		const { getByDataTest } = render(Icon, { name: 'arrow-up', 'data-test': 'up' });
		const svg = getByDataTest('up');
		expect(svg.localName).toBe('svg');
		const path = svg.querySelector('path');
		expect(path).not.toBeNull();
		expect(path?.getAttribute('d')).toBe(ICON_PATHS['arrow-up']);
	});
});
