import { fireEvent } from '@testing-library/svelte';
import { beforeAll, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import AvatarCropScreen from './AvatarCropScreen.svelte';

beforeAll(() => {
	vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
		cb(new Blob([], { type: 'image/jpeg' }));
	});
});

describe('AvatarCropScreen', () => {
	const makeFile = () => new File(['x'], 'test.jpg', { type: 'image/jpeg' });

	test('(a) renders a canvas element', () => {
		const { container } = render(AvatarCropScreen, {
			imageFile: makeFile(),
			oncancel: vi.fn(),
			onsave: vi.fn()
		});
		expect(container.querySelector('canvas')).not.toBeNull();
	});

	test('(b) Cancel button calls oncancel', async () => {
		const oncancel = vi.fn();
		const { getByDataTest } = render(AvatarCropScreen, {
			imageFile: makeFile(),
			oncancel,
			onsave: vi.fn()
		});
		await fireEvent.click(getByDataTest('crop-cancel'));
		expect(oncancel).toHaveBeenCalledTimes(1);
	});

	test('(c) Save button calls onsave with a non-null Blob', async () => {
		const onsave = vi.fn();
		const { getByDataTest } = render(AvatarCropScreen, {
			imageFile: makeFile(),
			oncancel: vi.fn(),
			onsave
		});
		await fireEvent.click(getByDataTest('crop-save'));
		expect(onsave).toHaveBeenCalledWith(expect.any(Blob));
	});

	test('(d) when toBlob returns null, onsave(null) is called', async () => {
		vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementationOnce((cb) => {
			cb(null);
		});
		const onsave = vi.fn();
		const { getByDataTest } = render(AvatarCropScreen, {
			imageFile: makeFile(),
			oncancel: vi.fn(),
			onsave
		});
		await fireEvent.click(getByDataTest('crop-save'));
		expect(onsave).toHaveBeenCalledWith(null);
	});
});
