// Injected at build time by build-defines.ts (Vite and Vitest share it).
export const APP_VERSION: string = __APP_VERSION__;
export const BUILD_DATE: string = __BUILD_DATE__;

/** The About screen's version line: `v0.0.1 · build 2026-10-20`. */
export function formatBuildLine(version: string, date: string): string {
	return `v${version} · build ${date}`;
}
