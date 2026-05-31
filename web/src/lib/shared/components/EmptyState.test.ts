import { fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$lib/basic/components/Icon.svelte');
vi.mock('$lib/basic/components/Button.svelte');

import EmptyState from './EmptyState.svelte';

function snippet(html: string) {
	return createRawSnippet(() => ({ render: () => html }));
}

describe('EmptyState', () => {
	test('(a) outermost element has data-test', () => {
		const { getByDataTest } = render(EmptyState, { 'data-test': 'es' });
		expect(getByDataTest('es')).toBeTruthy();
	});

	test('(b) disc element is present', () => {
		const { container } = render(EmptyState, {});
		expect(container.querySelector('.empty-circle')).not.toBeNull();
	});

	test('(c) Icon renders when icon is supplied', () => {
		const { container } = render(EmptyState, { icon: 'feather' });
		expect(container.querySelector('[data-test="feather"]')).not.toBeNull();
	});

	test('(d) disc renders snippet content when iconContent is supplied', () => {
		const { container } = render(EmptyState, {
			iconContent: snippet('<span data-test="custom-glyph"></span>'),
			icon: 'feather'
		});
		expect(container.querySelector('[data-test="custom-glyph"]')).not.toBeNull();
	});

	test('(e) icon is ignored when iconContent is supplied', () => {
		const { container } = render(EmptyState, {
			iconContent: snippet('<span data-test="custom-glyph"></span>'),
			icon: 'feather'
		});
		expect(container.querySelector('[data-test="feather"]')).toBeNull();
	});

	test('(f) heading text renders when title is supplied', () => {
		const { container } = render(EmptyState, { title: 'Nothing here' });
		expect(container.querySelector('.empty-heading')?.textContent).toBe('Nothing here');
	});

	test('(g) body text renders when body is supplied', () => {
		const { container } = render(EmptyState, { body: 'Add something.' });
		expect(container.querySelector('.empty-body')?.textContent).toBe('Add something.');
	});

	test('(h) CTA button renders when both ctaLabel and onCta are supplied', () => {
		const { container } = render(EmptyState, {
			ctaLabel: 'Create',
			onCta: vi.fn()
		});
		expect(container.querySelector('button')).not.toBeNull();
	});

	test('(i) clicking CTA fires onCta', async () => {
		const onCta = vi.fn();
		const { container } = render(EmptyState, { ctaLabel: 'Create', onCta });
		await fireEvent.click(container.querySelector('button')!);
		expect(onCta).toHaveBeenCalledTimes(1);
	});

	test('(j) CTA absent when neither ctaLabel nor onCta supplied', () => {
		const { container } = render(EmptyState, {});
		expect(container.querySelector('button')).toBeNull();
	});

	test('(k) CTA absent when only ctaLabel supplied', () => {
		const { container } = render(EmptyState, { ctaLabel: 'Create' });
		expect(container.querySelector('button')).toBeNull();
	});

	test('(l) CTA absent when only onCta supplied', () => {
		const { container } = render(EmptyState, { onCta: vi.fn() });
		expect(container.querySelector('button')).toBeNull();
	});
});
