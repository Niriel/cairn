import { describe, expect, test } from 'vitest';

import { formatLegalDate } from '$lib/legal/model/format-date';
import { GOVERNING_LAW, POLICY_DATES } from '$lib/legal/model/operator';
import { render } from '$lib/test/render';

import Page from './+page.svelte';

function section(container: HTMLElement, heading: string): string {
	const h2 = [...container.querySelectorAll('h2')].find((h) => h.textContent?.trim() === heading);
	return (h2?.closest('section')?.textContent ?? '').replace(/\s+/g, ' ');
}

describe('/about/terms', () => {
	test('shows when the terms were last updated', () => {
		const { getByText } = render(Page);
		expect(getByText(`Last updated ${formatLegalDate(POLICY_DATES.terms)}`)).toBeTruthy();
	});

	test('names the governing law and the competent court', () => {
		const { container } = render(Page);
		const law = section(container, 'Governing law');
		expect(law).toContain(GOVERNING_LAW.law);
		expect(law).toContain(GOVERNING_LAW.court);
	});

	test('promises at least 30 days notice before a shutdown', () => {
		const { container } = render(Page);
		expect(section(container, 'Ending the deal')).toMatch(/at least 30 days/);
	});

	test('on suspension, promises no in-app notice but invites you to write and ask why', () => {
		const { container } = render(Page);
		const suspension = section(container, 'Suspension');
		expect(suspension).toMatch(/won't get a notice in the app/);
		expect(suspension).toMatch(/write to us to ask why/);
	});

	test('presents its sections in order', () => {
		const { container } = render(Page);
		const headings = [...container.querySelectorAll('h2')].map((h) => h.textContent?.trim());
		expect(headings).toEqual([
			'What Cairn is',
			'Your account',
			'Your content',
			'Our promises',
			'Suspension',
			'Ending the deal',
			'Liability',
			'Governing law'
		]);
	});

	test('ships no placeholder text', () => {
		const { container } = render(Page);
		expect(container.textContent).not.toMatch(/\[[^\]]+\]/);
	});
});
