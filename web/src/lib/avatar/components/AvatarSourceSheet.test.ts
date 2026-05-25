import { fireEvent } from '@testing-library/svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import AvatarSourceSheet from './AvatarSourceSheet.svelte';

vi.mock('$lib/basic/components/Sheet.svelte');

describe('AvatarSourceSheet', () => {
	test('(a) renders Take photo and Choose from library rows', () => {
		const { getByText } = render(AvatarSourceSheet, { onfile: vi.fn(), oncancel: vi.fn() });
		expect(getByText('Take photo')).not.toBeNull();
		expect(getByText('Choose from library')).not.toBeNull();
	});

	test('(b) Cancel row calls oncancel', async () => {
		const oncancel = vi.fn();
		const { getByText } = render(AvatarSourceSheet, { onfile: vi.fn(), oncancel });
		await fireEvent.click(getByText('Cancel'));
		expect(oncancel).toHaveBeenCalledTimes(1);
	});

	test('(c) selecting a file via library input calls onfile(file)', async () => {
		const onfile = vi.fn();
		const { container } = render(AvatarSourceSheet, { onfile, oncancel: vi.fn() });
		const libraryInput = container.querySelector(
			'input[accept="image/*"]:not([capture])'
		) as HTMLInputElement;
		const fakeFile = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
		Object.defineProperty(libraryInput, 'files', { value: [fakeFile], configurable: true });
		await fireEvent.change(libraryInput);
		expect(onfile).toHaveBeenCalledWith(fakeFile);
	});
});
