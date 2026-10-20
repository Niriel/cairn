import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import { buildLicensesText } from '../../../../scripts/gen-licenses.mjs';

describe('static/legal/licenses.txt', () => {
	test('matches the licence texts of the installed browser dependencies', () => {
		const committed = readFileSync(resolve(process.cwd(), 'static/legal/licenses.txt'), 'utf8');
		// A boolean on purpose: toBe(committed) would print a ~100 KB diff on failure.
		expect(
			committed === buildLicensesText(process.cwd()),
			'licenses.txt is stale: run `pnpm gen:licenses` and commit the result'
		).toBe(true);
	});
});
