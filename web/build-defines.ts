import { readFileSync } from 'node:fs';

// Compile-time constants for the app bundle, shared by vite.config.ts and
// vitest.config.ts so tests see the same values as a production build. Read
// from package.json, not git: the Docker build context has no .git.
export function buildDefines(): Record<string, string> {
	const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
		version: string;
	};
	return {
		__APP_VERSION__: JSON.stringify(pkg.version),
		__BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10))
	};
}
