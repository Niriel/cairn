import type { Component } from 'svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

// Every page under /about — the hub and each legal page, including any added
// later — must ship real values, never a bracketed placeholder such as
// "[Operator name]".
const pages = import.meta.glob<{ default: Component }>('./**/+page.svelte', { eager: true });

describe('/about pages ship no placeholder text', () => {
	test('the glob finds the hub and every legal page', () => {
		expect(Object.keys(pages).length).toBeGreaterThanOrEqual(7);
	});

	test.each(Object.entries(pages))('%s', (_path, page) => {
		const { container } = render(page.default);
		expect(container.textContent).not.toMatch(/\[[^\]]+\]/);
	});
});
