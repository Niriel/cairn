import { fireEvent, screen } from '@testing-library/svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import CircleExplainerSheet from './CircleExplainerSheet.svelte';

vi.mock('$lib/basic/components/Sheet.svelte');

describe('CircleExplainerSheet', () => {
	test('(a) renders content when open={true}', () => {
		render(CircleExplainerSheet, { open: true, onclose: vi.fn() });
		expect(screen.queryByText('Got it')).not.toBeNull();
	});

	test('(b) renders nothing when open={false}', () => {
		render(CircleExplainerSheet, { open: false, onclose: vi.fn() });
		expect(screen.queryByText('Got it')).toBeNull();
	});

	test('(c) Got it button calls onclose', async () => {
		const onclose = vi.fn();
		render(CircleExplainerSheet, { open: true, onclose });
		await fireEvent.click(screen.getByText('Got it'));
		expect(onclose).toHaveBeenCalledTimes(1);
	});
});
