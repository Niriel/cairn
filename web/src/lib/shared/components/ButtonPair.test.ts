import { createRawSnippet } from 'svelte';
import { describe, expect, test } from 'vitest';

import { render } from '$lib/test/render';

import ButtonPair from './ButtonPair.svelte';

function buttonSnippet(label: string, dataTest: string) {
	return createRawSnippet(() => ({
		render: () => `<button data-test="${dataTest}">${label}</button>`
	}));
}

describe('ButtonPair', () => {
	test('(a) renders both left and right snippets', () => {
		const { getByDataTest } = render(ButtonPair, {
			left: buttonSnippet('Cancel', 'cancel'),
			right: buttonSnippet('OK', 'ok')
		});
		expect(getByDataTest('cancel').textContent).toBe('Cancel');
		expect(getByDataTest('ok').textContent).toBe('OK');
	});

	test('(b) right button comes after left in DOM order', () => {
		const { getByDataTest } = render(ButtonPair, {
			left: buttonSnippet('Cancel', 'cancel'),
			right: buttonSnippet('OK', 'ok')
		});
		const left = getByDataTest('cancel');
		const right = getByDataTest('ok');
		const relation = left.compareDocumentPosition(right);
		expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});
