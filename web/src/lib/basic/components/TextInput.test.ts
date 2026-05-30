import { fireEvent } from '@testing-library/svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import TextInput from './TextInput.svelte';

describe('TextInput', () => {
	test('renders an <input> element', () => {
		const { container } = render(TextInput, { value: '' });
		expect(container.querySelector('input')).not.toBeNull();
	});

	test('input reflects the value prop', () => {
		const { container } = render(TextInput, { value: 'hello' });
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.value).toBe('hello');
	});

	test('default type is text', () => {
		const { container } = render(TextInput, { value: '' });
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.type).toBe('text');
	});

	test('type="email" sets the input type', () => {
		const { container } = render(TextInput, { value: '', type: 'email' });
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.type).toBe('email');
	});

	test('disabled prop is honoured', () => {
		const { container } = render(TextInput, { value: '', disabled: true });
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.disabled).toBe(true);
	});

	test('placeholder renders', () => {
		const { container } = render(TextInput, { value: '', placeholder: 'Enter text' });
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.placeholder).toBe('Enter text');
	});

	test('oninput is called when the user types', async () => {
		const oninput = vi.fn();
		const { container } = render(TextInput, { value: '', oninput });
		const input = container.querySelector('input') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'abc' } });
		expect(oninput).toHaveBeenCalledTimes(1);
	});

	test('onchange is called on change', async () => {
		const onchange = vi.fn();
		const { container } = render(TextInput, { value: '', onchange });
		const input = container.querySelector('input') as HTMLInputElement;
		await fireEvent.change(input, { target: { value: 'abc' } });
		expect(onchange).toHaveBeenCalledTimes(1);
	});

	test('onblur is called on blur', async () => {
		const onblur = vi.fn();
		const { container } = render(TextInput, { value: '', onblur });
		const input = container.querySelector('input') as HTMLInputElement;
		await fireEvent.blur(input);
		expect(onblur).toHaveBeenCalledTimes(1);
	});

	test('onkeydown is called on keydown', async () => {
		const onkeydown = vi.fn();
		const { container } = render(TextInput, { value: '', onkeydown });
		const input = container.querySelector('input') as HTMLInputElement;
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(onkeydown).toHaveBeenCalledTimes(1);
	});

	test('id passes through to the input', () => {
		const { container } = render(TextInput, { value: '', id: 'my-input' });
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.id).toBe('my-input');
	});

	test('name passes through to the input', () => {
		const { container } = render(TextInput, { value: '', name: 'email' });
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.name).toBe('email');
	});

	test('autocomplete passes through to the input', () => {
		const { container } = render(TextInput, { value: '', autocomplete: 'email' });
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.autocomplete).toBe('email');
	});

	test('inputmode passes through to the input', () => {
		const { container } = render(TextInput, { value: '', inputmode: 'email' });
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.getAttribute('inputmode')).toBe('email');
	});

	test('data-test passes through to the input', () => {
		const { getByDataTest } = render(TextInput, { value: '', 'data-test': 'my-field' });
		expect(getByDataTest('my-field').tagName.toLowerCase()).toBe('input');
	});
});
