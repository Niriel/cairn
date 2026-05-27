import { fireEvent } from '@testing-library/svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import VoteControl from './VoteControl.svelte';

describe('VoteControl', () => {
	test('(a) renders 0 when value is null', () => {
		const { getByDataTest } = render(VoteControl, { value: null, onchange: vi.fn() });
		expect(getByDataTest('vote-indicator').textContent).toBe('0');
	});

	test('(b) renders + when value is 1', () => {
		const { getByDataTest } = render(VoteControl, { value: 1, onchange: vi.fn() });
		expect(getByDataTest('vote-indicator').textContent).toBe('+');
	});

	test('(c) renders --- when value is −3', () => {
		const { getByDataTest } = render(VoteControl, { value: -3, onchange: vi.fn() });
		expect(getByDataTest('vote-indicator').textContent).toBe('---');
	});

	test('(d) tapping up calls onchange(1) when value is null', async () => {
		const onchange = vi.fn();
		const { getByDataTest } = render(VoteControl, { value: null, onchange });
		await fireEvent.click(getByDataTest('vote-up'));
		expect(onchange).toHaveBeenCalledWith(1);
	});

	test('(e) tapping up when value is +1 calls onchange(2)', async () => {
		const onchange = vi.fn();
		const { getByDataTest } = render(VoteControl, { value: 1, onchange });
		await fireEvent.click(getByDataTest('vote-up'));
		expect(onchange).toHaveBeenCalledWith(2);
	});

	test('(f) tapping down when value is +1 calls onchange(null) — vote removal', async () => {
		const onchange = vi.fn();
		const { getByDataTest } = render(VoteControl, { value: 1, onchange });
		await fireEvent.click(getByDataTest('vote-down'));
		expect(onchange).toHaveBeenCalledWith(null);
	});

	test('(g) thumbs-up button is disabled when value is +3', async () => {
		const onchange = vi.fn();
		const { getByDataTest } = render(VoteControl, { value: 3, onchange });
		await fireEvent.click(getByDataTest('vote-up'));
		expect(onchange).not.toHaveBeenCalled();
	});

	test('(h) tapping up when value is −1 calls onchange(null) — vote removal', async () => {
		const onchange = vi.fn();
		const { getByDataTest } = render(VoteControl, { value: -1, onchange });
		await fireEvent.click(getByDataTest('vote-up'));
		expect(onchange).toHaveBeenCalledWith(null);
	});

	test('(i) clicking a thumb stops event propagation', async () => {
		const parentClick = vi.fn();
		const { getByDataTest, container } = render(VoteControl, { value: null, onchange: vi.fn() });
		container.firstElementChild?.addEventListener('click', parentClick);
		await fireEvent.click(getByDataTest('vote-up'));
		expect(parentClick).not.toHaveBeenCalled();
	});
});
