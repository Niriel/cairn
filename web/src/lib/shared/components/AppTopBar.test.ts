import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';
import { profile } from '$lib/shared/state/profile.svelte';

import AppTopBar from './AppTopBar.svelte';

vi.mock('$lib/shared/state/profile.svelte');

function span(html: string, dataTest?: string) {
	const attr = dataTest ? ` data-test="${dataTest}"` : '';
	return createRawSnippet(() => ({
		render: () => `<span${attr}>${html}</span>`
	}));
}

describe('AppTopBar', () => {
	afterEach(() => {
		profile.displayName = null;
	});

	test('(a) falls back to "Signed in as <name>" when no sub is given', () => {
		profile.displayName = 'Alice';
		const { getByText } = render(AppTopBar, {
			children: span('Settings')
		});
		expect(getByText('Signed in as Alice')).not.toBeNull();
	});

	test('(b) prefers an explicit sub over the fallback', () => {
		profile.displayName = 'Alice';
		const { getByText, queryByText } = render(AppTopBar, {
			children: span('Items'),
			sub: '3 items · 2 members'
		});
		expect(getByText('3 items · 2 members')).not.toBeNull();
		expect(queryByText('Signed in as Alice')).toBeNull();
	});

	test('(c) renders no subtitle when displayName is not yet loaded', () => {
		profile.displayName = null;
		const { queryByText } = render(AppTopBar, {
			children: span('Settings')
		});
		expect(queryByText(/Signed in as/)).toBeNull();
	});
});
