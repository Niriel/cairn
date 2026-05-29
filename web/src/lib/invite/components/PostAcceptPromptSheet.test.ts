import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$lib/basic/components/Sheet.svelte');
vi.mock('$lib/shared/components/ButtonPair.svelte');
vi.mock('$lib/invite/state/invitations.svelte');
vi.mock('$lib/privacy/state/relationships.svelte');

import { addCircleById, relationships } from '$lib/privacy/state/relationships.svelte';
import { invitations } from '$lib/invite/state/invitations.svelte';
import { SvelteSet } from 'svelte/reactivity';

import PostAcceptPromptSheet from './PostAcceptPromptSheet.svelte';

const BOB_UID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const BOB_ENTRY = { inviterUid: BOB_UID, inviterName: 'Bob' };

beforeEach(() => {
	vi.clearAllMocks();
	invitations.postAcceptPrompts = new SvelteSet();
	invitations.postAcceptPrompts.add(BOB_ENTRY);
	relationships.circle = [];
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('PostAcceptPromptSheet', () => {
	test('(a) renders prompt copy with inviter name', () => {
		const { getByDataTest } = render(PostAcceptPromptSheet);
		const sheet = getByDataTest('post-accept-prompt');
		expect(sheet.textContent).toContain('Bob');
		expect(sheet.textContent).toContain('accepted');
		expect(sheet.textContent).toContain('circle');
	});

	test('(b) "Not now" removes entry from postAcceptPrompts', async () => {
		const { getByDataTest } = render(PostAcceptPromptSheet);
		await fireEvent.click(getByDataTest('post-accept-not-now'));
		await tick();
		expect(invitations.postAcceptPrompts.size).toBe(0);
	});

	test('(c) "Add to circle" calls addCircleById with inviterUid then removes entry', async () => {
		vi.mocked(addCircleById).mockResolvedValue(undefined);
		const { getByDataTest } = render(PostAcceptPromptSheet);
		await fireEvent.click(getByDataTest('post-accept-add-to-circle'));
		await tick();
		expect(addCircleById).toHaveBeenCalledWith(BOB_UID);
		expect(invitations.postAcceptPrompts.size).toBe(0);
	});

	test('(d) silently dismisses entry when inviter is already in circle', async () => {
		relationships.circle = [
			{
				otherUserId: BOB_UID,
				displayName: 'Bob',
				avatarVersion: 0,
				createdAt: '2026-05-01T00:00:00Z'
			}
		];
		render(PostAcceptPromptSheet);
		await tick();
		expect(invitations.postAcceptPrompts.size).toBe(0);
	});
});
