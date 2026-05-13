import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Resolve Svelte to its browser build so @testing-library/svelte can mount
	// components into happy-dom (the default Node conditions pick the server
	// build, where `mount()` is not available).
	resolve: {
		conditions: ['browser']
	},
	test: {
		environment: 'happy-dom',
		setupFiles: ['./vitest.setup.ts'],
		include: ['src/**/*.{test,spec}.{js,ts,svelte}'],
		globals: false,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/**/*.{ts,svelte}'],
			exclude: ['src/**/*.{test,spec}.{ts,svelte}', 'src/lib/test/**']
		}
	}
});
