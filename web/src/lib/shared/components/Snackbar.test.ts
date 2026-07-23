import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { pushHistoryGuard } from '$lib/shared/state/back-stack.svelte';
import { render } from '$lib/test/render';

import Snackbar from './Snackbar.svelte';

vi.mock('$lib/shared/state/back-stack.svelte');

describe('Snackbar', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.mocked(pushHistoryGuard).mockClear();
	});

	test('(a) calls onclose after 6000ms when open=true', () => {
		vi.useFakeTimers();
		const onclose = vi.fn();
		render(Snackbar, {
			open: true,
			message: 'Item deleted',
			onclose,
			'data-test': 'snack'
		});
		expect(onclose).not.toHaveBeenCalled();
		vi.advanceTimersByTime(6000);
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	test('(b) flipping open=false before 6000ms cancels the timer', async () => {
		vi.useFakeTimers();
		const onclose = vi.fn();
		const { rerender } = render(Snackbar, {
			open: true,
			message: 'Item deleted',
			onclose,
			'data-test': 'snack'
		});
		vi.advanceTimersByTime(1000);
		await rerender({
			open: false,
			message: 'Item deleted',
			onclose,
			'data-test': 'snack'
		});
		vi.advanceTimersByTime(6000);
		expect(onclose).not.toHaveBeenCalled();
	});

	test('(c) never calls pushHistoryGuard', () => {
		vi.useFakeTimers();
		const onclose = vi.fn();
		render(Snackbar, {
			open: true,
			message: 'Item deleted',
			onclose,
			'data-test': 'snack'
		});
		vi.advanceTimersByTime(6000);
		expect(pushHistoryGuard).not.toHaveBeenCalled();
	});

	test('(d) clicking the action button calls onaction', async () => {
		const onaction = vi.fn();
		const onclose = vi.fn();
		const { getByDataTest } = render(Snackbar, {
			open: true,
			message: 'Item deleted',
			actionLabel: 'Undo',
			onaction,
			onclose,
			'data-test': 'snack'
		});
		await fireEvent.click(getByDataTest('snack-action'));
		expect(onaction).toHaveBeenCalledTimes(1);
	});

	test('(e) default (non-persistent) renders no dismiss control', () => {
		const onclose = vi.fn();
		const { queryByDataTest } = render(Snackbar, {
			open: true,
			message: 'Item deleted',
			onclose,
			'data-test': 'snack'
		});
		expect(queryByDataTest('snack-dismiss')).toBeNull();
	});

	test('(f) persistent does not auto-close on the timer', () => {
		vi.useFakeTimers();
		const onclose = vi.fn();
		render(Snackbar, {
			open: true,
			message: 'A new version is available — refresh',
			persistent: true,
			onclose,
			'data-test': 'snack'
		});
		vi.advanceTimersByTime(6000);
		expect(onclose).not.toHaveBeenCalled();
	});

	test('(g) persistent renders a dismiss control that calls onclose', async () => {
		const onclose = vi.fn();
		const { getByDataTest } = render(Snackbar, {
			open: true,
			message: 'A new version is available — refresh',
			persistent: true,
			onclose,
			'data-test': 'snack'
		});
		await fireEvent.click(getByDataTest('snack-dismiss'));
		expect(onclose).toHaveBeenCalledTimes(1);
	});
});
