import { describe, expect, test } from 'vitest';

import { formatLegalDate } from '$lib/legal/model/format-date';
import { GOVERNING_LAW, POLICY_DATES } from '$lib/legal/model/operator';
import { render } from '$lib/test/render';
import { headingTexts, sectionText } from '$lib/test/text';

import Page from './+page.svelte';

describe('/about/terms', () => {
	test('shows when the terms were last updated', () => {
		const { getByText } = render(Page);
		expect(getByText(`Last updated ${formatLegalDate(POLICY_DATES.terms)}`)).toBeTruthy();
	});

	test('names the governing law and the competent court', () => {
		const { container } = render(Page);
		const law = sectionText(container, 'Governing law');
		expect(law).toContain(GOVERNING_LAW.law);
		expect(law).toContain(GOVERNING_LAW.court);
	});

	test('promises at least 30 days notice before a shutdown', () => {
		const { container } = render(Page);
		expect(sectionText(container, 'Ending the deal')).toMatch(/at least 30 days/);
	});

	test('on suspension, promises no in-app notice but invites you to write and ask why', () => {
		const { container } = render(Page);
		const suspension = sectionText(container, 'Suspension');
		expect(suspension).toMatch(/won't get a notice in the app/);
		expect(suspension).toMatch(/write to us to ask why/);
	});

	test('presents its sections in order', () => {
		const { container } = render(Page);
		const headings = headingTexts(container);
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
});
