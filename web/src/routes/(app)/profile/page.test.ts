import { fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { profile } from '$lib/shared/state/profile.svelte';
import { server } from '$lib/test/server';
import { render } from '$lib/test/render';

import Page from './+page.svelte';

vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/shared/components/Snackbar.svelte');
vi.mock('$lib/avatar/components/AvatarSourceSheet.svelte');
vi.mock('$lib/avatar/components/AvatarCropScreen.svelte');
vi.mock('$lib/shared/state/profile.svelte');

afterEach(() => {
	vi.clearAllMocks();
	profile.displayName = null;
	profile.uid = null;
	profile.avatarVersion = 0;
});

describe('/profile page', () => {
	test('(a) shows display name in edit state', () => {
		profile.displayName = 'Alice';
		const { queryByDataTest } = render(Page);
		const input = queryByDataTest('display-name-input') as HTMLInputElement | null;
		expect(input).not.toBeNull();
		expect(input!.value).toBe('Alice');
	});

	test('(b) Save button calls set_display_name RPC', async () => {
		let seenBody: unknown = null;
		server.use(
			http.post('*/api/rpc/set_display_name', async ({ request }) => {
				seenBody = await request.json();
				return new HttpResponse(null, { status: 204 });
			})
		);
		profile.displayName = 'Alice';
		const { getByDataTest } = render(Page);
		await fireEvent.click(getByDataTest('save-profile'));
		await vi.waitFor(() => {
			expect(seenBody).toEqual({ new_name: 'Alice' });
		});
	});

	test('(b2) Enter on display-name input calls set_display_name RPC', async () => {
		let seenBody: unknown = null;
		server.use(
			http.post('*/api/rpc/set_display_name', async ({ request }) => {
				seenBody = await request.json();
				return new HttpResponse(null, { status: 204 });
			})
		);
		profile.displayName = 'Alice';
		const { getByDataTest } = render(Page);
		await fireEvent.keyDown(getByDataTest('display-name-input'), { key: 'Enter' });
		await vi.waitFor(() => {
			expect(seenBody).toEqual({ new_name: 'Alice' });
		});
	});

	test('(b3) Escape on display-name input calls history.back', async () => {
		const back = vi.spyOn(history, 'back').mockImplementation(() => {});
		profile.displayName = 'Alice';
		const { getByDataTest } = render(Page);
		await fireEvent.keyDown(getByDataTest('display-name-input'), { key: 'Escape' });
		expect(back).toHaveBeenCalled();
		back.mockRestore();
	});

	test('(c) Remove button is absent when profile.avatarVersion === 0', () => {
		profile.avatarVersion = 0;
		const { queryByDataTest } = render(Page);
		expect(queryByDataTest('remove-avatar')).toBeNull();
	});

	test('(d) Remove button is present when profile.avatarVersion === 1', () => {
		profile.avatarVersion = 1;
		const { queryByDataTest } = render(Page);
		expect(queryByDataTest('remove-avatar')).not.toBeNull();
	});

	test('(e) clicking Remove calls clear_avatar RPC and DELETE /avatars/me', async () => {
		let clearAvatarCalled = false;
		let deleteAvatarMeCalled = false;
		server.use(
			http.post('*/api/rpc/clear_avatar', () => {
				clearAvatarCalled = true;
				return new HttpResponse(null, { status: 204 });
			}),
			http.delete('*/avatars/me', () => {
				deleteAvatarMeCalled = true;
				return HttpResponse.json({ ok: true });
			})
		);
		profile.avatarVersion = 1;
		const { getByDataTest } = render(Page);
		await fireEvent.click(getByDataTest('remove-avatar'));
		await vi.waitFor(() => {
			expect(clearAvatarCalled).toBe(true);
			expect(deleteAvatarMeCalled).toBe(true);
		});
	});

	test('(f) clicking Change picture opens AvatarSourceSheet', async () => {
		const { getByDataTest, queryByDataTest } = render(Page);
		expect(queryByDataTest('avatar-source-sheet')).toBeNull();
		await fireEvent.click(getByDataTest('change-picture'));
		expect(queryByDataTest('avatar-source-sheet')).not.toBeNull();
	});

	test('(g) upload success state renders "Saved"', async () => {
		const { getByDataTest, getByText } = render(Page);
		await fireEvent.click(getByDataTest('change-picture'));
		await fireEvent.click(getByDataTest('avatar-source-library'));
		await fireEvent.click(getByDataTest('crop-save'));
		await vi.waitFor(() => {
			expect(getByText('Saved')).not.toBeNull();
		});
	});

	test('(h) upload too-big error renders "That\'s a big one"', async () => {
		server.use(http.post('*/avatars', () => new HttpResponse(null, { status: 413 })));
		const { getByDataTest, getByText } = render(Page);
		await fireEvent.click(getByDataTest('change-picture'));
		await fireEvent.click(getByDataTest('avatar-source-library'));
		await fireEvent.click(getByDataTest('crop-save'));
		await vi.waitFor(() => {
			expect(getByText("That's a big one")).not.toBeNull();
		});
	});

	test('(i) blank name + 422 shows "Name can\'t be blank"', async () => {
		server.use(
			http.post('*/api/rpc/set_display_name', () =>
				HttpResponse.json([{ code: '23514', message: 'check constraint violation' }], {
					status: 422
				})
			)
		);
		profile.displayName = '';
		const { getByDataTest, getByText } = render(Page);
		await fireEvent.click(getByDataTest('save-profile'));
		await vi.waitFor(() => {
			expect(getByText("Name can't be blank")).not.toBeNull();
		});
	});

	test('(j) non-blank name + 422 shows "Name must be 100 characters or fewer"', async () => {
		server.use(
			http.post('*/api/rpc/set_display_name', () =>
				HttpResponse.json([{ code: '23514', message: 'check constraint violation' }], {
					status: 422
				})
			)
		);
		profile.displayName = 'Alice';
		const { getByDataTest, getByText } = render(Page);
		await fireEvent.click(getByDataTest('save-profile'));
		await vi.waitFor(() => {
			expect(getByText('Name must be 100 characters or fewer')).not.toBeNull();
		});
	});

	test('(k) clear_avatar 500 shows snackbar and re-enables Remove', async () => {
		server.use(http.post('*/api/rpc/clear_avatar', () => new HttpResponse(null, { status: 500 })));
		profile.avatarVersion = 1;
		const { getByDataTest, getByText } = render(Page);
		await fireEvent.click(getByDataTest('remove-avatar'));
		await vi.waitFor(() => {
			expect(getByText("Couldn't remove picture — try again.")).not.toBeNull();
		});
		expect((getByDataTest('remove-avatar') as HTMLButtonElement).disabled).toBe(false);
	});
});
