import { describe, expect, test } from 'vitest';

import { formatLegalDate } from '$lib/legal/model/format-date';
import {
	OPERATOR,
	POLICY_DATES,
	PROCESSORS,
	SUPERVISORY_AUTHORITY
} from '$lib/legal/model/operator';
import { render } from '$lib/test/render';
import { normalizedText } from '$lib/test/text';

import Page from './+page.svelte';

describe('/about/privacy', () => {
	test('(a) shows when the policy was last updated', () => {
		const { getByText } = render(Page);
		expect(getByText(`Last updated ${formatLegalDate(POLICY_DATES.privacy)}`)).toBeTruthy();
	});

	test('(b) names the controller with a mail link', () => {
		const { getByDataTest } = render(Page);
		const controller = getByDataTest('privacy-controller');
		expect(controller.textContent).toContain(OPERATOR.name);
		expect(controller.querySelector('a')?.getAttribute('href')).toBe(`mailto:${OPERATOR.email}`);
	});

	test('(c) names every data processor', () => {
		const { container } = render(Page);
		for (const processor of PROCESSORS) expect(normalizedText(container)).toContain(processor.name);
	});

	test('(d) links the supervisory authority for complaints', () => {
		const { getByText } = render(Page);
		const link = getByText(SUPERVISORY_AUTHORITY.name).closest('a');
		expect(link?.getAttribute('href')).toBe(SUPERVISORY_AUTHORITY.url);
	});

	test('(e) lists the on-device storage: two cookies and four local settings', () => {
		const { getByDataTest } = render(Page);
		const storage = normalizedText(getByDataTest('privacy-storage'));
		expect(storage).toMatch(/two cookies/i);
		expect(storage).toMatch(/four small settings/i);
		expect(storage).toMatch(/offline cache/i);
	});

	test('(f) says plainly that there are no off-site backups yet', () => {
		const { container } = render(Page);
		expect(normalizedText(container)).toContain('There are currently no off-site backups.');
	});

	test('(g) presents its sections in order', () => {
		const { container } = render(Page);
		const headings = [...container.querySelectorAll('h2')].map((h) => h.textContent?.trim());
		expect(headings).toEqual([
			"Who's responsible",
			'What we store',
			'Public lists',
			'Why, and on what basis',
			'Where it lives',
			'Who sees it',
			'How long we keep it',
			'Your rights',
			'Cookies and on-device storage',
			'No tracking',
			'Changes'
		]);
	});

	test('(i) discloses that IP addresses are used in memory for rate limiting', () => {
		const { getByDataTest } = render(Page);
		const disclosure = normalizedText(getByDataTest('privacy-rate-limit'));
		expect(disclosure).toMatch(/IP address/);
		expect(disclosure).toMatch(/memory/);
		expect(disclosure).toMatch(/never written to disk/);
	});

	test('(j) says the recovery e-mail may carry essential service notices', () => {
		const { getByDataTest } = render(Page);
		expect(getByDataTest('privacy-recovery-email').textContent).toMatch(
			/essential service notices/
		);
	});

	test('(k) mentions the moderation audit log', () => {
		const { container } = render(Page);
		expect(normalizedText(container)).toMatch(/audit log/);
	});
});
