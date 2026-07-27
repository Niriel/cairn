import { defineConfig, devices } from '@playwright/test';

// The PWA specs need a *built* app: the service worker is inert under
// `pnpm dev` (see src/lib/pwa/state/service-worker.svelte.ts), so nothing
// caches and nothing survives going offline. They therefore run against
// `vite preview`, which serves the adapter-static build — and which
// vite.config.ts now gives the same dev auth shim and `/api` proxy the dev
// server has, so the specs can sign in and fetch.
//
// Backend containers (`docker compose up -d` + migrations) must be up
// separately, exactly as playwright.config.ts documents.

const PORT = 4173;

export default defineConfig({
	testDir: './e2e',
	// Only the specs that need a real service worker. Everything else stays on
	// the dev-server config, where it runs faster and without a build step.
	testMatch: ['offline-read.spec.ts', 'pwa-install.spec.ts'],
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
	// Chromium only: WebKit can't run on the Fedora dev boxes, and iOS install
	// behaviour has no headless equivalent anyway — it's verified by hand.
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'pnpm build && pnpm preview',
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		// Generous: the build runs before the server starts listening.
		timeout: 180_000
	}
});
