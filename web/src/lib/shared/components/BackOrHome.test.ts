import { fireEvent } from '@testing-library/svelte';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ICON_PATHS } from '$lib/basic/model/icon-paths';
import { render } from '$lib/test/render';

import { _resetForTesting, recordInAppNavigation } from '$lib/shared/state/nav-history.svelte';

import BackOrHome from './BackOrHome.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));
vi.mock('$app/paths', () => ({ resolve: vi.fn((p: string) => p) }));

function iconPath(container: HTMLElement): string | null {
	return container.querySelector('path')?.getAttribute('d') ?? null;
}

describe('BackOrHome', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		_resetForTesting();
	});

	test('(a) with in-app history: back chevron, calls history.back()', async () => {
		const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
		try {
			recordInAppNavigation();
			const { getByDataTest, container } = render(BackOrHome, {});

			expect(iconPath(container)).toBe(ICON_PATHS['chevron-left']);
			expect(getByDataTest('topbar-back').getAttribute('aria-label')).toBe('Back');

			const { goto } = await import('$app/navigation');
			await fireEvent.click(getByDataTest('topbar-back'));
			expect(backSpy).toHaveBeenCalledTimes(1);
			expect(vi.mocked(goto)).not.toHaveBeenCalled();
		} finally {
			backSpy.mockRestore();
		}
	});

	test('(b) cold load: home icon, navigates to /lists', async () => {
		const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
		try {
			const { getByDataTest, container } = render(BackOrHome, {});

			expect(iconPath(container)).toBe(ICON_PATHS['home']);
			expect(getByDataTest('topbar-back').getAttribute('aria-label')).toBe('Home');

			const { goto } = await import('$app/navigation');
			await fireEvent.click(getByDataTest('topbar-back'));
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/lists');
			expect(backSpy).not.toHaveBeenCalled();
		} finally {
			backSpy.mockRestore();
		}
	});
});
