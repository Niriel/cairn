import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { install } from '$lib/pwa/state/install.svelte';
import { render } from '$lib/test/render';

import InstallHint from './InstallHint.svelte';

vi.mock('$lib/pwa/state/install.svelte');
vi.mock('$lib/pwa/components/InstallExplainerSheet.svelte');

afterEach(() => {
	vi.clearAllMocks();
	install.canPrompt = false;
	install.isStandalone = false;
	install.isIos = false;
	install.hintDismissed = false;
});

describe('InstallHint', () => {
	test('(a) shows when the browser has offered an install prompt', () => {
		install.canPrompt = true;
		const { queryByDataTest } = render(InstallHint);
		expect(queryByDataTest('install-hint')).not.toBeNull();
	});

	test('(b) shows on iOS, which never offers a prompt', () => {
		install.isIos = true;
		const { queryByDataTest } = render(InstallHint);
		expect(queryByDataTest('install-hint')).not.toBeNull();
	});

	test('(c) hidden when already running installed', () => {
		install.canPrompt = true;
		install.isStandalone = true;
		const { queryByDataTest } = render(InstallHint);
		expect(queryByDataTest('install-hint')).toBeNull();
	});

	test('(d) hidden once dismissed', () => {
		install.canPrompt = true;
		install.hintDismissed = true;
		const { queryByDataTest } = render(InstallHint);
		expect(queryByDataTest('install-hint')).toBeNull();
	});

	test('(e) hidden on a browser with no prompt and no manual path', () => {
		const { queryByDataTest } = render(InstallHint);
		expect(queryByDataTest('install-hint')).toBeNull();
	});

	test('(f) Install fires the captured prompt when there is one', async () => {
		install.canPrompt = true;
		const { getByDataTest, queryByDataTest } = render(InstallHint);
		await fireEvent.click(getByDataTest('install-hint-install'));
		expect(install.promptInstall).toHaveBeenCalledTimes(1);
		expect(queryByDataTest('install-explainer-sheet')).toBeNull();
	});

	test('(g) Install opens the explainer on iOS, where there is no prompt', async () => {
		install.isIos = true;
		const { getByDataTest, queryByDataTest } = render(InstallHint);
		expect(queryByDataTest('install-explainer-sheet')).toBeNull();

		await fireEvent.click(getByDataTest('install-hint-install'));
		expect(install.promptInstall).not.toHaveBeenCalled();
		expect(queryByDataTest('install-explainer-sheet')).not.toBeNull();
	});

	test('(h) dismiss calls dismissHint', async () => {
		install.canPrompt = true;
		const { getByDataTest } = render(InstallHint);
		await fireEvent.click(getByDataTest('install-hint-dismiss'));
		expect(install.dismissHint).toHaveBeenCalledTimes(1);
	});
});
