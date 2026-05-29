import { createRawSnippet } from 'svelte';
import { describe, expect, test } from 'vitest';

import { render } from '$lib/test/render';

import Label from './Label.svelte';

function text(t: string) {
	return createRawSnippet(() => ({ render: () => `<span>${t}</span>` }));
}

describe('Label', () => {
	test('renders a <label> element', () => {
		const { container } = render(Label, { children: text('Name') });
		expect(container.querySelector('label')).not.toBeNull();
	});

	test('renders children text', () => {
		const { container } = render(Label, { children: text('Display name') });
		const label = container.querySelector('label') as HTMLLabelElement;
		expect(label.textContent).toBe('Display name');
	});

	test('for prop sets the htmlFor attribute', () => {
		const { container } = render(Label, { children: text('Name'), for: 'my-input' });
		const label = container.querySelector('label') as HTMLLabelElement;
		expect(label.htmlFor).toBe('my-input');
	});

	test('for prop is absent when not set', () => {
		const { container } = render(Label, { children: text('Name') });
		const label = container.querySelector('label') as HTMLLabelElement;
		expect(label.getAttribute('for')).toBeNull();
	});

	test('data-test passes through to the label', () => {
		const { getByDataTest } = render(Label, { children: text('Name'), 'data-test': 'name-label' });
		expect(getByDataTest('name-label').tagName.toLowerCase()).toBe('label');
	});
});
