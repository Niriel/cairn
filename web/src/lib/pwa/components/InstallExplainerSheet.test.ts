import { fireEvent, screen } from '@testing-library/svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import InstallExplainerSheet from './InstallExplainerSheet.svelte';

vi.mock('$lib/basic/components/Sheet.svelte');

describe('InstallExplainerSheet', () => {
	test('(a) renders the Add to Home Screen explainer when open', () => {
		const { container } = render(InstallExplainerSheet, { open: true, onclose: vi.fn() });
		expect(screen.queryByText('Add Cairn to your Home Screen')).not.toBeNull();
		// The two-step gesture is the whole point of the sheet.
		expect(container.textContent).toContain('Share');
		expect(container.textContent).toContain('Add to Home Screen');
	});

	test('(b) renders nothing when open={false}', () => {
		render(InstallExplainerSheet, { open: false, onclose: vi.fn() });
		expect(screen.queryByText('Add Cairn to your Home Screen')).toBeNull();
	});

	test('(c) Got it button calls onclose', async () => {
		const onclose = vi.fn();
		render(InstallExplainerSheet, { open: true, onclose });
		await fireEvent.click(screen.getByText('Got it'));
		expect(onclose).toHaveBeenCalledTimes(1);
	});
});
