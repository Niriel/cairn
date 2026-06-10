import { fireEvent } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$lib/shared/components/Avatar.svelte');

import type { InboxEntry } from '$lib/invite/state/invitations.svelte';

import InviteCard from './InviteCard.svelte';

const ENTRY: InboxEntry = {
	id: 'inv-1',
	listId: '22222222-2222-2222-2222-222222222222',
	listName: "Bob's list",
	inviterUid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
	inviterName: 'Bob',
	inviterAvatarVersion: 0,
	createdAt: '2026-05-10T10:00:00Z'
};

describe('InviteCard', () => {
	// timeAgo reads the wall clock; pin it just after the fixture's createdAt
	// so the relative-date assertion stays deterministic.
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-11T10:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test('renders the inviter name and list name', () => {
		const { container } = render(InviteCard, {
			entry: ENTRY,
			onAccept: vi.fn(),
			onDecline: vi.fn()
		});
		expect(container.textContent).toContain('Bob');
		expect(container.textContent).toContain("Bob's list");
	});

	test('renders the relative date', () => {
		const { container } = render(InviteCard, {
			entry: ENTRY,
			onAccept: vi.fn(),
			onDecline: vi.fn()
		});
		// timeAgo renders a relative phrase ending in "ago" for a past date.
		expect(container.textContent).toMatch(/ago/);
	});

	test('Accept fires onAccept', async () => {
		const onAccept = vi.fn();
		const { getByDataTest } = render(InviteCard, {
			entry: ENTRY,
			onAccept,
			onDecline: vi.fn(),
			acceptDataTest: 'accept'
		});
		await fireEvent.click(getByDataTest('accept'));
		expect(onAccept).toHaveBeenCalledTimes(1);
	});

	test('Decline fires onDecline', async () => {
		const onDecline = vi.fn();
		const { getByDataTest } = render(InviteCard, {
			entry: ENTRY,
			onAccept: vi.fn(),
			onDecline,
			declineDataTest: 'decline'
		});
		await fireEvent.click(getByDataTest('decline'));
		expect(onDecline).toHaveBeenCalledTimes(1);
	});
});
