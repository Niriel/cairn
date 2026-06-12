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

	test('(c) when status is ready, the filename chip and Download button render and download() fires', async () => {
		exportMod.exportState.status = 'ready';
		exportMod.exportState.result = {
			blob: new Blob(['{}']),
			fileName: 'cairn-export-20260612-abc123.zip'
		};
		const { getByDataTest } = render(ExportHubScreen);
		expect(getByDataTest('export-filename').textContent).toContain(
			'cairn-export-20260612-abc123.zip'
		);
		const button = getByDataTest('export-download');
		await fireEvent.click(button);
		expect(vi.mocked(exportMod.download)).toHaveBeenCalledTimes(1);
	});

	test('(d) when status is packaging, the progress state renders', () => {
		exportMod.exportState.status = 'packaging';
		const { getByDataTest } = render(ExportHubScreen);
		expect(getByDataTest('export-packaging').textContent).toContain('Packaging your data');
	});

	test('(e) when status is error, a message and a Try again button render', async () => {
		exportMod.exportState.status = 'error';
		exportMod.exportState.error = 'Something went wrong.';
		const { getByDataTest } = render(ExportHubScreen);
		expect(getByDataTest('export-error').textContent).toContain('Something went wrong.');
		await fireEvent.click(getByDataTest('export-retry'));
		expect(vi.mocked(exportMod.prepare)).toHaveBeenCalledTimes(1);
	});
});
