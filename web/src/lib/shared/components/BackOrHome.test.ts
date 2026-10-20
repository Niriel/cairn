import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest';

import { ICON_PATHS } from '$lib/basic/model/icon-paths';
import { render } from '$lib/test/render';

import { navHistory } from '$lib/shared/state/nav-history.svelte';

import BackOrHome from './BackOrHome.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));
vi.mock('$app/paths', () => ({ resolve: vi.fn((p: string) => p) }));
vi.mock('$lib/shared/state/nav-history.svelte');

function iconPath(container: HTMLElement): string | null {
	return container.querySelector('path')?.getAttribute('d') ?? null;
}

describe('BackOrHome', () => {
	let backSpy: MockInstance<typeof history.back>;

	beforeEach(() => {
		vi.clearAllMocks();
		navHistory.canGoBack = false;
		backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
	});

	afterEach(() => {
		backSpy.mockRestore();
	});

	test('(a) with a Cairn page behind: back chevron, calls history.back()', async () => {
		navHistory.canGoBack = true;
		const { getByDataTest, container } = render(BackOrHome, {});

		expect(iconPath(container)).toBe(ICON_PATHS['chevron-left']);
		expect(getByDataTest('topbar-back').getAttribute('aria-label')).toBe('Back');

		const { goto } = await import('$app/navigation');
		await fireEvent.click(getByDataTest('topbar-back'));
		expect(backSpy).toHaveBeenCalledTimes(1);
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(b) with nothing in Cairn behind: home icon, navigates to /lists', async () => {
		const { getByDataTest, container } = render(BackOrHome, {});

		expect(iconPath(container)).toBe(ICON_PATHS['home']);
		expect(getByDataTest('topbar-back').getAttribute('aria-label')).toBe('Home');

		const { goto } = await import('$app/navigation');
		await fireEvent.click(getByDataTest('topbar-back'));
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/lists');
		expect(backSpy).not.toHaveBeenCalled();
	});

	test('(c) follows the history as it changes', async () => {
		const { getByDataTest, container } = render(BackOrHome, {});
		expect(getByDataTest('topbar-back').getAttribute('aria-label')).toBe('Home');

		navHistory.canGoBack = true;
		await tick();
		expect(iconPath(container)).toBe(ICON_PATHS['chevron-left']);
		expect(getByDataTest('topbar-back').getAttribute('aria-label')).toBe('Back');
	});
});
