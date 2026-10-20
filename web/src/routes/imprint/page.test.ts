import { isRedirect } from '@sveltejs/kit';
import { describe, expect, test, vi } from 'vitest';

import { load } from './+page';

vi.mock('$app/paths', () => ({ resolve: vi.fn((path: string) => path) }));

describe('/imprint', () => {
	test('redirects the legacy imprint URL to /about/imprint', () => {
		let thrown: unknown;
		try {
			load();
		} catch (error) {
			thrown = error;
		}
		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { location: string }).location).toBe('/about/imprint');
	});
});
