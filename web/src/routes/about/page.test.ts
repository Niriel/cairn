import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { APP_VERSION, BUILD_DATE, formatBuildLine } from '$lib/legal/model/build-info';
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
		expect(getByDataTest('about-version').textContent?.trim()).toBe(
			formatBuildLine(APP_VERSION, BUILD_DATE)
		);
	});

	test('(b) lists the six legal and project pages, in order', () => {
		const { getByDataTest, container } = render(Page);
		for (const [hook, title] of ROWS) expect(getByDataTest(hook).textContent).toContain(title);
		const order = [...container.querySelectorAll('[data-test^="about-"]')]
			.map((el) => el.getAttribute('data-test'))
			.filter((hook) => ROWS.some(([rowHook]) => rowHook === hook));
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

	test('(e) ships no placeholder text', () => {
		const { container } = render(Page);
		expect(container.textContent).not.toMatch(/\[[^\]]+\]/);
	});
});
