import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';
import type { CircleEntry } from '$lib/privacy/model/relationship';

import CircleScreen from './CircleScreen.svelte';

vi.mock('$lib/privacy/components/CircleExplainerSheet.svelte');
vi.mock('$lib/privacy/state/relationships.svelte');
vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/Snackbar.svelte');
vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/shared/state/profile.svelte');

const { relationships, addCircleByUsername, removeFromCircle } =
	await import('$lib/privacy/state/relationships.svelte');

const BOB: CircleEntry = {
	otherUserId: 'bob-uid',
	displayName: 'Bob',
	avatarVersion: 0,
	createdAt: '2026-04-12T10:00:00Z'
};

afterEach(() => {
	vi.clearAllMocks();
	relationships.loaded = false;
	relationships.circle = [];
	relationships.blocked = [];
});

describe('CircleScreen', () => {
	test('(a) loading gate: circle list absent when not loaded', () => {
		relationships.loaded = false;
		const { queryByDataTest } = render(CircleScreen);
		expect(queryByDataTest('circle-list')).toBeNull();
	});

	test('(b) circle row renders when loaded and circle has an entry', () => {
		relationships.loaded = true;
		relationships.circle = [BOB];
		const { queryByDataTest } = render(CircleScreen);
		expect(queryByDataTest(`circle-row-${BOB.otherUserId}`)).not.toBeNull();
	});

	test('(c) Remove button calls removeFromCircle with correct id', async () => {
		relationships.loaded = true;
		relationships.circle = [BOB];
		const { getByDataTest } = render(CircleScreen);
		await fireEvent.click(getByDataTest(`remove-${BOB.otherUserId}`));
		expect(vi.mocked(removeFromCircle)).toHaveBeenCalledWith(BOB.otherUserId);
	});

	test("(d) What's this? click opens the explainer", async () => {
		const { getByDataTest, queryByDataTest } = render(CircleScreen);
		expect(queryByDataTest('circle-explainer-sheet')).toBeNull();
		await fireEvent.click(getByDataTest('whats-this'));
		expect(queryByDataTest('circle-explainer-sheet')).not.toBeNull();
	});

	test('(e) add-by-username submit calls addCircleByUsername and clears input on success', async () => {
		vi.mocked(addCircleByUsername).mockResolvedValueOnce({ ok: true });
		const { getByDataTest } = render(CircleScreen);
		const input = getByDataTest('circle-add-input') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'BobHandle' } });
		await fireEvent.click(getByDataTest('circle-add-btn'));
		expect(vi.mocked(addCircleByUsername)).toHaveBeenCalledWith('BobHandle');
		expect(input.value).toBe('');
	});

	test("(f) 'no-such-user' result shows inline error", async () => {
		vi.mocked(addCircleByUsername).mockResolvedValueOnce({ ok: false, reason: 'no-such-user' });
		const { getByDataTest, queryByDataTest } = render(CircleScreen);
		expect(queryByDataTest('circle-add-error')).toBeNull();
		await fireEvent.click(getByDataTest('circle-add-btn'));
		expect(queryByDataTest('circle-add-error')).not.toBeNull();
	});

	test("(g) 'self' result shows inline error", async () => {
		vi.mocked(addCircleByUsername).mockResolvedValueOnce({ ok: false, reason: 'self' });
		const { getByDataTest, queryByDataTest } = render(CircleScreen);
		expect(queryByDataTest('circle-add-error')).toBeNull();
		await fireEvent.click(getByDataTest('circle-add-btn'));
		expect(queryByDataTest('circle-add-error')).not.toBeNull();
	});

	test("(h) 'unknown' result shows snackbar", async () => {
		vi.mocked(addCircleByUsername).mockResolvedValueOnce({ ok: false, reason: 'unknown' });
		const { getByDataTest, queryByDataTest } = render(CircleScreen);
		expect(queryByDataTest('circle-snackbar')).toBeNull();
		await fireEvent.click(getByDataTest('circle-add-btn'));
		expect(queryByDataTest('circle-snackbar')).not.toBeNull();
	});
});
