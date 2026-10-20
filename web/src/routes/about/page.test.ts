import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { BUILD_LINE } from '$lib/legal/model/build-info';
import { HOSTING_COUNTRY, OPERATOR } from '$lib/legal/model/operator';
import { render } from '$lib/test/render';

import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/paths', () => ({ resolve: vi.fn((path: string) => path) }));

afterEach(() => {
	vi.clearAllMocks();
});

const ROWS = [
	['about-privacy', 'Privacy policy', '/about/privacy'],
	['about-terms', 'Terms of service', '/about/terms'],
	['about-imprint', 'Imprint', '/about/imprint'],
	['about-open-source', 'Open source', '/about/open-source'],
	['about-contact', 'Contact', '/about/contact'],
	['about-license', 'Source code', '/about/license']
] as const;

describe('/about', () => {
	test('(a) shows the app version and build date', () => {
		const { getByDataTest } = render(Page);
		expect(getByDataTest('about-version').textContent?.trim()).toBe(BUILD_LINE);
	});

	test('(b) lists the six legal and project pages, in order', () => {
		const { getByDataTest, container } = render(Page);
		for (const [hook, title] of ROWS) expect(getByDataTest(hook).textContent).toContain(title);
		const order = [...container.querySelectorAll('.nav-rows [data-test]')].map((el) =>
			el.getAttribute('data-test')
		);
		expect(order).toEqual(ROWS.map(([hook]) => hook));
	});

	test.each(ROWS)('(c) the %s row opens %s', async (hook, _title, path) => {
		const { getByDataTest } = render(Page);
		await fireEvent.click(getByDataTest(hook));
		expect(vi.mocked(goto)).toHaveBeenCalledWith(path);
	});

	test('(d) the footer names the brand, the town, and the hosting country', () => {
		const { getByDataTest } = render(Page);
		const footer = getByDataTest('about-footer').textContent ?? '';
		expect(footer).toContain(OPERATOR.brand);
		expect(footer).toContain(OPERATOR.town);
		expect(footer).toContain(HOSTING_COUNTRY);
	});
});
