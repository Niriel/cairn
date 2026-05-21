import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Tests stub the env var the predicate reads (`VITE_DEV_LOGIN_SHORTCUT`);
// they don't try to flip `import.meta.env.DEV`. Vitest 4.x's
// `vi.stubEnv('MODE', …)` may not re-derive Vite's computed `DEV`/`PROD`
// booleans, so a "shortcut absent" assertion that relies on flipping
// `DEV` would silently always pass. The `DEV` belt-and-braces in the
// predicate is untested production-build hygiene — Rollup tree-shakes it
// in production builds.
let mod: typeof import('./dev-shortcut');

beforeEach(async () => {
	vi.resetModules();
	mod = await import('./dev-shortcut');
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('isDevLoginShortcutEnabled', () => {
	test('returns true when VITE_DEV_LOGIN_SHORTCUT is "true"', () => {
		vi.stubEnv('VITE_DEV_LOGIN_SHORTCUT', 'true');
		expect(mod.isDevLoginShortcutEnabled()).toBe(true);
	});

	test('returns false when VITE_DEV_LOGIN_SHORTCUT is empty', () => {
		vi.stubEnv('VITE_DEV_LOGIN_SHORTCUT', '');
		expect(mod.isDevLoginShortcutEnabled()).toBe(false);
	});

	test('returns false when VITE_DEV_LOGIN_SHORTCUT is "false"', () => {
		vi.stubEnv('VITE_DEV_LOGIN_SHORTCUT', 'false');
		expect(mod.isDevLoginShortcutEnabled()).toBe(false);
	});

	test('returns false when VITE_DEV_LOGIN_SHORTCUT is any other string', () => {
		vi.stubEnv('VITE_DEV_LOGIN_SHORTCUT', '1');
		expect(mod.isDevLoginShortcutEnabled()).toBe(false);
	});
});
