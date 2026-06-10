import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The production shim must narrow on the SAME path lists as the web app.
// `auth-proxy/src/lib/auth-paths.ts` is a copy of the canonical
// `web/src/lib/shared/model/auth-paths.ts`; this guard fails the build if
// the two ever drift. We compare by parsing each file's `export const NAME
// = [...]` array declarations out of the source text rather than importing
// across package boundaries — that keeps the guard free of cross-package TS
// resolution, and (because we diff the whole set of array exports) it also
// catches a *new* array added to the canonical file but not copied here.

const canonicalPath = fileURLToPath(
	new URL('../../web/src/lib/shared/model/auth-paths.ts', import.meta.url)
);
const localPath = fileURLToPath(new URL('../src/lib/auth-paths.ts', import.meta.url));

function extractArrayExports(source: string): Record<string, string> {
	const out: Record<string, string> = {};
	const re = /export\s+const\s+(\w+)\s*=\s*(\[[^\]]*\])/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) {
		out[m[1]] = m[2].replace(/\s+/g, ' ').trim();
	}
	return out;
}

describe('auth-paths drift guard', () => {
	const canonical = extractArrayExports(readFileSync(canonicalPath, 'utf8'));
	const local = extractArrayExports(readFileSync(localPath, 'utf8'));

	it('parses the known canonical array exports (anchor so empty-vs-empty cannot pass)', () => {
		expect(Object.keys(canonical).sort()).toEqual([
			'BEARER_AUTH_PATHS',
			'COOKIE_PLANT_PATHS',
			'LOGOUT_PATHS',
			'PUBLIC_AUTH_PATHS',
			'SIGNED_IN_REDIRECT_PATHS'
		]);
	});

	it('local copy matches the canonical source for every exported array', () => {
		expect(local).toEqual(canonical);
	});
});
