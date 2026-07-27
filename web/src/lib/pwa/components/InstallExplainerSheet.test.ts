import { fireEvent, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { install } from '$lib/pwa/state/install.svelte';
import { render } from '$lib/test/render';

import InstallExplainerSheet from './InstallExplainerSheet.svelte';

vi.mock('$lib/basic/components/Sheet.svelte');
vi.mock('$lib/pwa/state/install.svelte');

afterEach(() => {
	install.isIos = false;
});

describe('InstallExplainerSheet', () => {
	test('(a) walks through the Safari share gesture on iOS', () => {
		install.isIos = true;
		const { container } = render(InstallExplainerSheet, { open: true, onclose: vi.fn() });
		expect(screen.queryByText('Add Cairn to your Home Screen')).not.toBeNull();
		// The two-step gesture is the whole point of the sheet on iOS.
		expect(container.textContent).toContain('Safari');
		expect(container.textContent).toContain('Share');
		expect(container.textContent).toContain('Add to Home Screen');
	});

	test('(b) points elsewhere at the browser menu, naming no browser', () => {
		const { container } = render(InstallExplainerSheet, { open: true, onclose: vi.fn() });
		expect(screen.queryByText('Install Cairn')).not.toBeNull();
		// Nothing here should claim the user is on Safari, or tell an Android
		// or desktop user to tap a share icon they don't have.
		expect(container.textContent).not.toContain('Safari');
		expect(container.textContent).not.toContain('Share');
		expect(container.textContent).toContain('menu');
	});

	test('(c) renders nothing when open={false}', () => {
		install.isIos = true;
		render(InstallExplainerSheet, { open: false, onclose: vi.fn() });
		expect(screen.queryByText('Add Cairn to your Home Screen')).toBeNull();
	});

	test('(d) Got it button calls onclose', async () => {
		const onclose = vi.fn();
		render(InstallExplainerSheet, { open: true, onclose });
		await fireEvent.click(screen.getByText('Got it'));
		expect(onclose).toHaveBeenCalledTimes(1);
	});
});
