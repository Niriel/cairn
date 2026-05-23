import { describe, expect, test } from 'vitest';

import { render } from '$lib/test/render';

import Avatar from './Avatar.svelte';

describe('Avatar', () => {
	test('(a) single-word name renders one initial', () => {
		const { container } = render(Avatar, { displayName: 'Alice' });
		expect(container.textContent?.trim()).toBe('A');
	});

	test('(b) two-word name renders two initials', () => {
		const { container } = render(Avatar, { displayName: 'Alice Wonderland' });
		expect(container.textContent?.trim()).toBe('AW');
	});

	test('(c) three-word name renders first and last initial', () => {
		const { container } = render(Avatar, { displayName: 'Mary Jane Watson' });
		expect(container.textContent?.trim()).toBe('MW');
	});

	test('(d) empty string renders ?', () => {
		const { container } = render(Avatar, { displayName: '' });
		expect(container.textContent?.trim()).toBe('?');
	});

	test('(e) same name produces same hue (colour stability)', () => {
		const { container: c1 } = render(Avatar, { displayName: 'Alice' });
		const { container: c2 } = render(Avatar, { displayName: 'Alice' });
		// data-hue carries the computed hue value; jsdom strips oklch() from styles
		const h1 = (c1.firstElementChild as HTMLElement)?.getAttribute('data-hue');
		const h2 = (c2.firstElementChild as HTMLElement)?.getAttribute('data-hue');
		expect(h1).toBeTruthy();
		expect(h1).toBe(h2);
	});

	test('(f) size prop sets width and height style', () => {
		const { container } = render(Avatar, { displayName: 'Alice', size: 60 });
		const el = container.firstElementChild as HTMLElement;
		expect(el.style.width).toBe('60px');
		expect(el.style.height).toBe('60px');
	});
});
