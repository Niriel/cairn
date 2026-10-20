import { describe, expect, test, vi } from 'vitest';

import { load } from './+page';

vi.mock('$app/paths', () => ({ resolve: vi.fn((path: string) => path) }));

describe('/imprint', () => {
	test('redirects the legacy imprint URL to /about/imprint', () => {
		expect(() => load()).toThrow(
			expect.objectContaining({ status: 308, location: '/about/imprint' })
		);
	});
});
