import { fireEvent } from '@testing-library/svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import Textarea from './Textarea.svelte';

describe('Textarea', () => {
	test('renders a <textarea> element', () => {
		const { container } = render(Textarea, { value: '' });
		expect(container.querySelector('textarea')).not.toBeNull();
	});

	test('textarea reflects the value prop', () => {
		const { container } = render(Textarea, { value: 'hello' });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(ta.value).toBe('hello');
	});

	test('disabled prop is honoured', () => {
		const { container } = render(Textarea, { value: '', disabled: true });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(ta.disabled).toBe(true);
	});

	test('placeholder renders', () => {
		const { container } = render(Textarea, { value: '', placeholder: 'Add a note' });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(ta.placeholder).toBe('Add a note');
	});

	test('rows prop sets the rows attribute', () => {
		const { container } = render(Textarea, { value: '', rows: 4 });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(ta.getAttribute('rows')).toBe('4');
	});

	test('minHeight prop sets min-height inline style', () => {
		const { container } = render(Textarea, { value: '', minHeight: '88px' });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(ta.style.minHeight).toBe('88px');
	});

	test('minHeight wins over rows when both are passed', () => {
		const { container } = render(Textarea, { value: '', rows: 3, minHeight: '120px' });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(ta.style.minHeight).toBe('120px');
		expect(ta.hasAttribute('rows')).toBe(false);
	});

	test('resize is none', () => {
		const { container } = render(Textarea, { value: '' });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(ta.style.resize).toBe('none');
	});

	test('oninput is called when the user types', async () => {
		const oninput = vi.fn();
		const { container } = render(Textarea, { value: '', oninput });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		await fireEvent.input(ta, { target: { value: 'abc' } });
		expect(oninput).toHaveBeenCalledTimes(1);
	});

	test('onchange is called on change', async () => {
		const onchange = vi.fn();
		const { container } = render(Textarea, { value: '', onchange });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		await fireEvent.change(ta, { target: { value: 'abc' } });
		expect(onchange).toHaveBeenCalledTimes(1);
	});

	test('onblur is called on blur', async () => {
		const onblur = vi.fn();
		const { container } = render(Textarea, { value: '', onblur });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		await fireEvent.blur(ta);
		expect(onblur).toHaveBeenCalledTimes(1);
	});

	test('onkeydown is called on keydown', async () => {
		const onkeydown = vi.fn();
		const { container } = render(Textarea, { value: '', onkeydown });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		await fireEvent.keyDown(ta, { key: 'Enter' });
		expect(onkeydown).toHaveBeenCalledTimes(1);
	});

	test('id passes through to the textarea', () => {
		const { container } = render(Textarea, { value: '', id: 'notes' });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(ta.id).toBe('notes');
	});

	test('name passes through to the textarea', () => {
		const { container } = render(Textarea, { value: '', name: 'description' });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(ta.name).toBe('description');
	});

	test('autocomplete passes through to the textarea', () => {
		const { container } = render(Textarea, { value: '', autocomplete: 'off' });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(ta.autocomplete).toBe('off');
	});

	test('data-test passes through to the textarea', () => {
		const { getByDataTest } = render(Textarea, { value: '', 'data-test': 'notes-field' });
		expect(getByDataTest('notes-field').tagName.toLowerCase()).toBe('textarea');
	});
});
