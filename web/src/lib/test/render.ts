import { render as tlRender } from '@testing-library/svelte';

export type DataTestQueries = {
	getByDataTest: (name: string) => HTMLElement;
	queryByDataTest: (name: string) => HTMLElement | null;
	getAllByDataTest: (name: string) => HTMLElement[];
};

export function bindDataTestQueries(container: ParentNode): DataTestQueries {
	const selector = (name: string) => `[data-test="${CSS.escape(name)}"]`;
	return {
		getByDataTest(name) {
			const els = container.querySelectorAll<HTMLElement>(selector(name));
			if (els.length === 0) {
				throw new Error(`getByDataTest: no element found with data-test="${name}"`);
			}
			if (els.length > 1) {
				throw new Error(
					`getByDataTest: multiple elements (${els.length}) found with data-test="${name}"`
				);
			}
			return els[0];
		},
		queryByDataTest(name) {
			return container.querySelector<HTMLElement>(selector(name));
		},
		getAllByDataTest(name) {
			return Array.from(container.querySelectorAll<HTMLElement>(selector(name)));
		}
	};
}

type TlRenderArgs = Parameters<typeof tlRender>;

export function render<P extends Record<string, unknown> = Record<string, unknown>>(
	Component: TlRenderArgs[0],
	props?: P
) {
	const result = tlRender(
		Component,
		props !== undefined ? ({ props } as TlRenderArgs[1]) : undefined
	);
	return Object.assign(result, bindDataTestQueries(result.container));
}
