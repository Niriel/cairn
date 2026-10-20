import { describe, expect, test } from 'vitest';

import pkg from '../../../../package.json';

import { ATTRIBUTIONS } from './attributions';

describe('open-source attributions', () => {
	test('credit every package that ships to the browser', () => {
		const credited = new Set(ATTRIBUTIONS.map((entry) => entry.package).filter(Boolean));
		const shipped = [...Object.keys(pkg.dependencies), 'svelte', '@sveltejs/kit'];
		const missing = shipped.filter((name) => !credited.has(name));
		expect(missing, 'add these to src/lib/legal/model/attributions.json').toEqual([]);
	});

	test('every entry names its licence and links to the project', () => {
		for (const entry of ATTRIBUTIONS) {
			expect(entry.license.length, entry.name).toBeGreaterThan(0);
			expect(entry.url, entry.name).toMatch(/^https:\/\//);
		}
	});
});
