import { tick } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { render } from '$lib/test/render';

import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

afterEach(() => {
	vi.clearAllMocks();
});

describe('/ (root)', () => {
	test('(a) redirects to /lists on mount', async () => {
		render(Page);
		await tick();
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/lists', { replaceState: true });
	});
});
