import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$lib/invite/components/PostAcceptPromptSheet.svelte');
vi.mock('$lib/invite/state/invitations.svelte');

import { invitations } from '$lib/invite/state/invitations.svelte';
import { SvelteSet } from 'svelte/reactivity';

import Layout from './+layout.svelte';

beforeEach(() => {
	vi.clearAllMocks();
	invitations.postAcceptPrompts = new SvelteSet();
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('(app)/+layout', () => {
	test('(a) prompt stub not rendered when postAcceptPrompts is empty', () => {
		invitations.postAcceptPrompts = new SvelteSet();
		const { queryByDataTest } = render(Layout);
		expect(queryByDataTest('post-accept-prompt-stub')).toBeNull();
	});

	test('(b) prompt stub rendered when one entry is in postAcceptPrompts', () => {
		invitations.postAcceptPrompts = new SvelteSet();
		invitations.postAcceptPrompts.add({ inviterUid: 'uid-1', inviterName: 'Bob' });
		const { queryByDataTest } = render(Layout);
		expect(queryByDataTest('post-accept-prompt-stub')).not.toBeNull();
	});
});
