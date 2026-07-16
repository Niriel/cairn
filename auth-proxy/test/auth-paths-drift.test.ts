import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The production shim must narrow on the SAME path lists as the web app, and
// share the same auth constants (the CSRF header name) byte-for-byte.
// `auth-proxy/src/lib/auth-paths.ts` is a copy of the canonical
// `web/src/lib/shared/model/auth-paths.ts`; this guard fails the build if
// the two ever drift. We compare by parsing each file's `export const NAME = …`
// declarations (arrays *and* quoted string literals) out of the source text
// rather than importing across package boundaries — that keeps the guard free
// of cross-package TS resolution, and (because we diff the whole set of
// exports) it also catches a *new* const added to the canonical file but not
// copied here.

const canonicalPath = fileURLToPath(
	new URL('../../web/src/lib/shared/model/auth-paths.ts', import.meta.url)
);
const localPath = fileURLToPath(new URL('../src/lib/auth-paths.ts', import.meta.url));

function extractConstExports(source: string): Record<string, string> {
	const out: Record<string, string> = {};
	// Capture array literals (`[...]`) and quoted string literals
	// (`'...'` / `"..."`). A bare string const would otherwise slip through
	// unguarded — fail-closed, but a silent divergence should be a build catch.
	const re = /export\s+const\s+(\w+)\s*=\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) {
		out[m[1]] = m[2].replace(/\s+/g, ' ').trim();
	}
	return out;
}

describe('auth-paths drift guard', () => {
	const canonical = extractConstExports(readFileSync(canonicalPath, 'utf8'));
	const local = extractConstExports(readFileSync(localPath, 'utf8'));

	it('parses the known canonical const exports (anchor so empty-vs-empty cannot pass)', () => {
		expect(Object.keys(canonical).sort()).toEqual([
			'CSRF_HEADER',
			'LOGOUT_PATHS',
			'PUBLIC_AUTH_PATHS',
			'SIGNED_IN_REDIRECT_PATHS'
		]);
	});

	it('local copy matches the canonical source for every exported const', () => {
		expect(local).toEqual(canonical);
	});
});
