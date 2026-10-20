import { describe, expect, test } from 'vitest';

import pkg from '../../../../package.json';

import { APP_VERSION, BUILD_DATE, formatBuildLine } from './build-info';

describe('build info', () => {
	test('formats the version line shown on the About screen', () => {
		expect(formatBuildLine('0.0.1', '2026-10-20')).toBe('v0.0.1 · build 2026-10-20');
	});

	test('the injected version is the web package version', () => {
		expect(APP_VERSION).toBe(pkg.version);
	});

	test('the injected build date is an ISO calendar date', () => {
		expect(BUILD_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
