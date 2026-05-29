import { fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import Button from './Button.svelte';

function label(text: string) {
	return createRawSnippet(() => ({
		render: () => `<span>${text}</span>`
	}));
}

describe('Button', () => {
	test('calls onclick when clicked', async () => {
		const onclick = vi.fn();
		const { getByDataTest } = render(Button, {
			'data-test': 'go',
			onclick,
			children: label('Go')
		});
		await fireEvent.click(getByDataTest('go'));
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	test('applies the destructive tone class', () => {
		const { getByDataTest } = render(Button, {
			tone: 'destructive',
			'data-test': 'x',
			children: label('Delete')
		});
		expect(getByDataTest('x')).toHaveClass('tone-destructive');
	});

	test('disabled prevents onclick', async () => {
		const onclick = vi.fn();
		const { getByDataTest } = render(Button, {
			'data-test': 'go',
			disabled: true,
			onclick,
			children: label('Go')
		});
		await fireEvent.click(getByDataTest('go'));
		expect(onclick).not.toHaveBeenCalled();
	});

	describe('variant classes', () => {
		test('rect variant', () => {
			const { getByDataTest } = render(Button, {
				variant: 'rect',
				'data-test': 'b',
				children: label('Ok')
			});
			expect(getByDataTest('b')).toHaveClass('rect');
		});

		test('pill variant', () => {
			const { getByDataTest } = render(Button, {
				variant: 'pill',
				'data-test': 'b',
				children: label('Ok')
			});
			expect(getByDataTest('b')).toHaveClass('pill');
		});

		test('text variant', () => {
			const { getByDataTest } = render(Button, {
				variant: 'text',
				'data-test': 'b',
				children: label('Ok')
			});
			expect(getByDataTest('b')).toHaveClass('text');
		});
	});

	describe('tone classes', () => {
		test('primary tone', () => {
			const { getByDataTest } = render(Button, {
				tone: 'primary',
				'data-test': 'b',
				children: label('Ok')
			});
			expect(getByDataTest('b')).toHaveClass('tone-primary');
		});

		test('ink tone', () => {
			const { getByDataTest } = render(Button, {
				tone: 'ink',
				'data-test': 'b',
				children: label('Ok')
			});
			expect(getByDataTest('b')).toHaveClass('tone-ink');
		});

		test('destructive tone', () => {
			const { getByDataTest } = render(Button, {
				tone: 'destructive',
				'data-test': 'b',
				children: label('Ok')
			});
			expect(getByDataTest('b')).toHaveClass('tone-destructive');
		});
	});

	describe('size classes', () => {
		test('md size', () => {
			const { getByDataTest } = render(Button, {
				size: 'md',
				'data-test': 'b',
				children: label('Ok')
			});
			expect(getByDataTest('b')).toHaveClass('size-md');
		});

		test('sm size', () => {
			const { getByDataTest } = render(Button, {
				size: 'sm',
				'data-test': 'b',
				children: label('Ok')
			});
			expect(getByDataTest('b')).toHaveClass('size-sm');
		});
	});

	describe('variant × tone × size combinations', () => {
		const combos: Array<{
			variant: 'rect' | 'pill' | 'text';
			tone: 'primary' | 'ink' | 'destructive';
			size: 'sm' | 'md';
		}> = [
			{ variant: 'rect', tone: 'primary', size: 'md' },
			{ variant: 'rect', tone: 'primary', size: 'sm' },
			{ variant: 'rect', tone: 'ink', size: 'md' },
			{ variant: 'rect', tone: 'ink', size: 'sm' },
			{ variant: 'rect', tone: 'destructive', size: 'md' },
			{ variant: 'rect', tone: 'destructive', size: 'sm' },
			{ variant: 'pill', tone: 'primary', size: 'md' },
			{ variant: 'pill', tone: 'primary', size: 'sm' },
			{ variant: 'pill', tone: 'ink', size: 'md' },
			{ variant: 'pill', tone: 'ink', size: 'sm' },
			{ variant: 'pill', tone: 'destructive', size: 'md' },
			{ variant: 'pill', tone: 'destructive', size: 'sm' },
			{ variant: 'text', tone: 'primary', size: 'md' },
			{ variant: 'text', tone: 'primary', size: 'sm' },
			{ variant: 'text', tone: 'ink', size: 'md' },
			{ variant: 'text', tone: 'ink', size: 'sm' },
			{ variant: 'text', tone: 'destructive', size: 'md' },
			{ variant: 'text', tone: 'destructive', size: 'sm' }
		];

		for (const { variant, tone, size } of combos) {
			test(`${variant} / ${tone} / ${size} applies correct classes`, () => {
				const { getByDataTest } = render(Button, {
					variant,
					tone,
					size,
					'data-test': 'b',
					children: label('Ok')
				});
				const btn = getByDataTest('b');
				expect(btn).toHaveClass(variant);
				expect(btn).toHaveClass(`tone-${tone}`);
				expect(btn).toHaveClass(`size-${size}`);
			});
		}
	});

	describe('leadingIcon', () => {
		test('renders icon inside button when leadingIcon is set', () => {
			const { getByDataTest } = render(Button, {
				leadingIcon: 'pencil',
				'data-test': 'b',
				children: label('Edit')
			});
			const btn = getByDataTest('b');
			expect(btn.querySelector('svg')).not.toBeNull();
		});

		test('does not render icon when leadingIcon is undefined', () => {
			const { getByDataTest } = render(Button, {
				'data-test': 'b',
				children: label('Ok')
			});
			expect(getByDataTest('b').querySelector('svg')).toBeNull();
		});
	});

	test('no-props default renders rect/primary/md classes', () => {
		const { getByDataTest } = render(Button, {
			'data-test': 'b',
			children: label('Ok')
		});
		const btn = getByDataTest('b');
		expect(btn).toHaveClass('rect');
		expect(btn).toHaveClass('tone-primary');
		expect(btn).toHaveClass('size-md');
	});
});
