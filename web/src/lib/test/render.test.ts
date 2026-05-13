import { describe, expect, it } from 'vitest';
import { bindDataTestQueries } from './render';

function buildFixture(html: string): HTMLElement {
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.append(container);
	return container;
}

const SINGLE = '<span data-test="hello">hi</span>';
const DUPED = '<span data-test="alpha">a</span><span data-test="alpha">b</span>';

describe('data-test queries', () => {
	it('getByDataTest returns the matching element', () => {
		const container = buildFixture(SINGLE);
		const { getByDataTest } = bindDataTestQueries(container);
		expect(getByDataTest('hello').textContent).toBe('hi');
	});

	it('queryByDataTest returns null when no element matches', () => {
		const container = buildFixture(SINGLE);
		const { queryByDataTest } = bindDataTestQueries(container);
		expect(queryByDataTest('missing')).toBeNull();
	});

	it('getByDataTest throws when multiple elements match', () => {
		const container = buildFixture(DUPED);
		const { getByDataTest } = bindDataTestQueries(container);
		expect(() => getByDataTest('alpha')).toThrowError(/multiple/);
	});

	it('getAllByDataTest returns every matching element', () => {
		const container = buildFixture(DUPED);
		const { getAllByDataTest } = bindDataTestQueries(container);
		const matches = getAllByDataTest('alpha');
		expect(matches).toHaveLength(2);
		expect(matches.map((el) => el.textContent)).toEqual(['a', 'b']);
	});
});
