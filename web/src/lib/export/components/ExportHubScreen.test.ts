import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';
import * as exportMod from '$lib/export/state/export.svelte';

import ExportHubScreen from './ExportHubScreen.svelte';

vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/shared/state/profile.svelte');
vi.mock('$lib/basic/components/Button.svelte');
vi.mock('$lib/export/state/export.svelte');

afterEach(() => {
	vi.clearAllMocks();
	exportMod.exportState.status = 'idle';
	exportMod.exportState.result = null;
	exportMod.exportState.error = null;
});

describe('ExportHubScreen', () => {
	test('(a) renders the "Prepare my download" button when idle', () => {
		const { getByDataTest } = render(ExportHubScreen);
		const button = getByDataTest('export-prepare');
		expect(button).not.toBeNull();
		expect(button.textContent).toContain('Prepare my download');
	});

	test('(b) clicking Prepare invokes prepare()', async () => {
		const { getByDataTest } = render(ExportHubScreen);
		await fireEvent.click(getByDataTest('export-prepare'));
		expect(vi.mocked(exportMod.prepare)).toHaveBeenCalledTimes(1);
	});

	test('(c) when status is ready, the Download button renders and invokes download()', async () => {
		exportMod.exportState.status = 'ready';
		exportMod.exportState.result = { blob: new Blob(['{}']), fileName: 'data.json' };
		const { getByDataTest } = render(ExportHubScreen);
		const button = getByDataTest('export-download');
		expect(button).not.toBeNull();
		await fireEvent.click(button);
		expect(vi.mocked(exportMod.download)).toHaveBeenCalledTimes(1);
	});
});
