import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import { OPERATOR, SOURCE_REPO_URL } from './operator';

// Every deployment-specific fact lives in operator.ts so a fork edits one
// file. This guard rejects the operator's identifying values anywhere else
// under src/ — import them from $lib/legal/model/operator instead.
const SRC = resolve(process.cwd(), 'src');
const EXEMPT = new Set(['operator.ts', 'operator.test.ts', 'single-source.test.ts']);

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return /\.(ts|js|svelte|css|html|json)$/.test(entry.name) ? [path] : [];
	});
}

describe('deployment facts live only in operator.ts', () => {
	const needles = [OPERATOR.name, OPERATOR.email, OPERATOR.addressLines[0], SOURCE_REPO_URL];

	test('no other source file spells out the operator name, e-mail, address, or repo URL', () => {
		const offenders = sourceFiles(SRC)
			.filter((file) => !EXEMPT.has(file.split(/[\\/]/).pop() ?? ''))
			.flatMap((file) => {
				const text = readFileSync(file, 'utf8');
				return needles
					.filter((needle) => text.includes(needle))
					.map((needle) => `${relative(SRC, file)} contains "${needle}"`);
			});
		expect(
			offenders,
			'import these values from $lib/legal/model/operator instead of spelling them out'
		).toEqual([]);
	});
});
