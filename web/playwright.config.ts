import { defineConfig, devices } from '@playwright/test';

// Playwright drives a real browser against the running dev stack — see
// docs/testing.md for what belongs here vs. Vitest.
//
// The webServer block lets `pnpm test:e2e` start the SvelteKit dev
// server automatically (or reuse one already running). The backend
// containers (`docker compose up -d` + migrations) must be up
// separately — Playwright doesn't manage Docker for us.

const PORT = 5173;

export default defineConfig({
	testDir: './e2e',
	// The PWA specs need a real service worker, which is inert under `pnpm dev`
	// — they run against `vite preview` via playwright.pwa.config.ts instead.
	testIgnore: ['offline-read.spec.ts', 'pwa-install.spec.ts'],
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
	],
	webServer: {
		command: 'pnpm dev',
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000
	}
});
