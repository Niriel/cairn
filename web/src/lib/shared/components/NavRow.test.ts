import { fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$lib/basic/components/Icon.svelte');
vi.mock('$lib/basic/components/Button.svelte');

import NavRow from './NavRow.svelte';

function snippet(html: string) {
	return createRawSnippet(() => ({ render: () => html }));
}

const lead = snippet('<span data-test="lead-slot"></span>');

describe('NavRow', () => {
	test('(a) renders the title', () => {
		const { container } = render(NavRow, { lead, title: 'Privacy' });
		expect(container.querySelector('.nav-row-title')?.textContent).toBe('Privacy');
	});

	test('(b) renders the sub when supplied', () => {
		const { container } = render(NavRow, { lead, title: 'Privacy', sub: 'circle · blocked' });
		expect(container.querySelector('.nav-row-sub')?.textContent).toBe('circle · blocked');
	});

	test('(c) no sub element when sub is omitted', () => {
		const { container } = render(NavRow, { lead, title: 'Sign out' });
		expect(container.querySelector('.nav-row-sub')).toBeNull();
	});

	test('(d) the lead snippet renders in its slot', () => {
		const { container } = render(NavRow, { lead, title: 'Privacy' });
		expect(container.querySelector('[data-test="lead-slot"]')).not.toBeNull();
	});

	test('(e) the trailing snippet renders in its slot', () => {
		const { container } = render(NavRow, {
			lead,
			title: 'Invites',
			trailing: snippet('<span data-test="trailing-slot"></span>')
		});
		expect(container.querySelector('[data-test="trailing-slot"]')).not.toBeNull();
	});

	test('(f) no trailing markup when the snippet is omitted', () => {
		const { container } = render(NavRow, { lead, title: 'Invites' });
		expect(container.querySelector('[data-test="trailing-slot"]')).toBeNull();
	});

	test('(g) clicking fires onclick', async () => {
		const onclick = vi.fn();
		const { container } = render(NavRow, { lead, title: 'Privacy', onclick });
		await fireEvent.click(container.querySelector('button')!);
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	test('(h) data-test is forwarded to the row button', () => {
		const { getByDataTest } = render(NavRow, {
			lead,
			title: 'Privacy',
			'data-test': 'nav-privacy'
		});
		expect(getByDataTest('nav-privacy').tagName).toBe('BUTTON');
	});

	test('(i) the accessible name derives from the title', () => {
		const { container } = render(NavRow, { lead, title: 'Privacy' });
		expect(container.querySelector('button')?.textContent).toContain('Privacy');
	});

	test('(j) tone="destructive" marks the row and forwards the tone to the button', () => {
		const { container } = render(NavRow, {
			lead,
			title: 'Delete account',
			tone: 'destructive'
		});
		expect(container.querySelector('.nav-row')?.classList.contains('destructive')).toBe(true);
		expect(container.querySelector('button')?.getAttribute('data-tone')).toBe('destructive');
	});

	test('(k) the default tone is ink — no destructive treatment', () => {
		const { container } = render(NavRow, { lead, title: 'Privacy' });
		expect(container.querySelector('.nav-row')?.classList.contains('destructive')).toBe(false);
		expect(container.querySelector('button')?.getAttribute('data-tone')).toBe('ink');
	});

	test('(l) renders without a lead snippet — title and chevron still present', () => {
		const onclick = vi.fn();
		const { container } = render(NavRow, { title: 'My list', onclick });
		expect(container.querySelector('.nav-row-title')?.textContent).toBe('My list');
		expect(container.querySelector('[data-test="chevron-right"]')).not.toBeNull();
	});

	test('(m) renders the handle as @handle on .identity-handle when supplied', () => {
		const { container } = render(NavRow, { lead, title: 'Alice', handle: 'alice' });
		expect(container.querySelector('.identity-handle')?.textContent).toBe('@alice');
	});

	test('(n) no handle element when handle is omitted', () => {
		const { container } = render(NavRow, { lead, title: 'Alice' });
		expect(container.querySelector('.identity-handle')).toBeNull();
	});
});
