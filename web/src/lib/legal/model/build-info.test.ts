import { describe, expect, test } from 'vitest';

import pkg from '../../../../package.json';

import { BUILD_LINE } from './build-info';

describe('build info', () => {
	test('the version line carries the web package version and an ISO build date', () => {
		expect(BUILD_LINE).toMatch(
			new RegExp(`^v${pkg.version.replaceAll('.', '\\.')} · build \\d{4}-\\d{2}-\\d{2}$`)
		);
	});
});
