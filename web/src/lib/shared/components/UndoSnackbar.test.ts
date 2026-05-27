import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import UndoSnackbar from './UndoSnackbar.svelte';

vi.mock('$lib/basic/components/Icon.svelte');

describe('UndoSnackbar', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	test('(a) renders data-test attribute', () => {
		const { getByDataTest } = render(UndoSnackbar, {
			deletedName: 'My item',
			onUndo: vi.fn(),
			ondismiss: vi.fn(),
			'data-test': 'my-snack'
		});
		expect(getByDataTest('my-snack')).not.toBeNull();
	});

	test('(b) calls onUndo when UNDO button is clicked', async () => {
		const onUndo = vi.fn();
		const { getByDataTest } = render(UndoSnackbar, {
			deletedName: 'My item',
			onUndo,
			ondismiss: vi.fn(),
			'data-test': 'my-snack'
		});
		await fireEvent.click(getByDataTest('my-snack-action'));
		expect(onUndo).toHaveBeenCalledTimes(1);
	});

	test('(c) calls ondismiss after 6000ms', () => {
		vi.useFakeTimers();
		const ondismiss = vi.fn();
		render(UndoSnackbar, {
			deletedName: 'My item',
			onUndo: vi.fn(),
			ondismiss,
			'data-test': 'my-snack'
		});
		expect(ondismiss).not.toHaveBeenCalled();
		vi.advanceTimersByTime(6000);
		expect(ondismiss).toHaveBeenCalledTimes(1);
	});
});
