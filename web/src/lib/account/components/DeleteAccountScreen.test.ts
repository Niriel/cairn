import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { server } from '$lib/test/server';
import { render } from '$lib/test/render';

import DeleteAccountScreen from './DeleteAccountScreen.svelte';

// TopBar pulls in profile state and router chrome we don't need here; Icon is
// pure decoration. Button stays REAL so its `disabled` state is asserted
// truthfully. session.svelte stays REAL so AUTH_BASE resolves to '/auth' and
// the MSW `*/auth/signout` handler matches.
vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/basic/components/Icon.svelte');
vi.mock('$app/navigation');
vi.mock('$app/paths');

afterEach(() => {
	vi.clearAllMocks();
});

async function type(el: HTMLElement, value: string) {
	await fireEvent.input(el, { target: { value } });
}

describe('DeleteAccountScreen', () => {
	test('(a) the destructive button is disabled until "delete" is typed', async () => {
		const { getByDataTest } = render(DeleteAccountScreen);
		const button = getByDataTest('delete-account-confirm') as HTMLButtonElement;
		expect(button.disabled).toBe(true);

		await type(getByDataTest('delete-account-input'), 'delete');
		expect(button.disabled).toBe(false);
	});

	test('(b) a confirmed press calls POST /rpc/delete_account', async () => {
		let called = false;
		server.use(
			http.post('*/api/rpc/delete_account', () => {
				called = true;
				return new HttpResponse(null, { status: 204 });
			})
		);
		const { getByDataTest } = render(DeleteAccountScreen);
		await type(getByDataTest('delete-account-input'), 'delete');
		await fireEvent.click(getByDataTest('delete-account-confirm'));
		await vi.waitFor(() => expect(called).toBe(true));
	});

	test('(c) on success the confirmation view renders', async () => {
		server.use(
			http.post('*/api/rpc/delete_account', () => new HttpResponse(null, { status: 204 }))
		);
		const { getByDataTest, queryByDataTest } = render(DeleteAccountScreen);
		await type(getByDataTest('delete-account-input'), 'delete');
		await fireEvent.click(getByDataTest('delete-account-confirm'));
		await vi.waitFor(() => expect(queryByDataTest('delete-account-done')).not.toBeNull());
		// The form is gone once the account is deleted.
		expect(queryByDataTest('delete-account-input')).toBeNull();
	});

	test('(d) on an RPC error the form stays and the error is shown', async () => {
		server.use(
			http.post('*/api/rpc/delete_account', () =>
				HttpResponse.json({ message: 'deletion failed' }, { status: 400 })
			)
		);
		const { getByDataTest, queryByDataTest } = render(DeleteAccountScreen);
		await type(getByDataTest('delete-account-input'), 'delete');
		await fireEvent.click(getByDataTest('delete-account-confirm'));
		await vi.waitFor(() =>
			expect(queryByDataTest('delete-account-error')?.textContent).toContain('deletion failed')
		);
		// Still on the form — no confirmation view.
		expect(queryByDataTest('delete-account-done')).toBeNull();
		expect(queryByDataTest('delete-account-input')).not.toBeNull();
	});

	test('(e) the export Download button is enabled and navigates to the export hub', async () => {
		const { getByDataTest } = render(DeleteAccountScreen);
		const download = getByDataTest('delete-account-export-download') as HTMLButtonElement;
		expect(download.disabled).toBe(false);

		await fireEvent.click(download);

		const { goto } = await import('$app/navigation');
		const { resolve } = await import('$app/paths');
		expect(vi.mocked(goto)).toHaveBeenCalledOnce();
		expect(vi.mocked(goto)).toHaveBeenCalledWith(vi.mocked(resolve)('/settings/data-export'));
	});
});
