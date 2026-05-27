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

	test('(f) size prop sets width and height style in rem', () => {
		const { container } = render(Avatar, { displayName: 'Alice', size: 60 });
		const el = container.firstElementChild as HTMLElement;
		expect(el.style.width).toBe('3.75rem');
		expect(el.style.height).toBe('3.75rem');
	});

	test('(g) avatarVersion > 0 with uid renders img with correct src', () => {
		const { container } = render(Avatar, { displayName: 'Alice', uid: 'abc', avatarVersion: 3 });
		const img = container.querySelector('img');
		expect(img).not.toBeNull();
		expect(img?.getAttribute('src')).toBe('/avatars/abc.webp?v=3');
	});

	test('(h) avatarVersion 0 renders initials (no img)', () => {
		const { container } = render(Avatar, { displayName: 'Alice', uid: 'abc', avatarVersion: 0 });
		expect(container.querySelector('img')).toBeNull();
		expect(container.textContent?.trim()).toBe('A');
	});

	test('(i) tombstone uid renders empty gray disc', () => {
		const { container } = render(Avatar, {
			displayName: 'Anything',
			uid: '00000000-0000-0000-0000-000000000000'
		});
		const el = container.firstElementChild as HTMLElement;
		expect(el.getAttribute('data-tombstone')).toBe('true');
		expect(container.textContent?.trim()).toBe('');
		expect(container.querySelector('img')).toBeNull();
	});

	test('(j) tombstone takes precedence over positive avatarVersion', () => {
		const { container } = render(Avatar, {
			displayName: 'Anything',
			uid: '00000000-0000-0000-0000-000000000000',
			avatarVersion: 5
		});
		const el = container.firstElementChild as HTMLElement;
		expect(container.querySelector('img')).toBeNull();
		expect(el.getAttribute('data-tombstone')).toBe('true');
	});

	test('(k) tombstone takes precedence over non-empty displayName', () => {
		const { container } = render(Avatar, {
			displayName: 'Alice',
			uid: '00000000-0000-0000-0000-000000000000'
		});
		expect(container.textContent?.trim()).toBe('');
	});
});
