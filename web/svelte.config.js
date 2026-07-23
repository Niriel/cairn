import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({
			fallback: 'index.html'
		}),
		serviceWorker: {
			// We own the update lifecycle (see src/service-worker.ts and the
			// swUpdate store); adapter-static still compiles the worker.
			register: false
		}
	}
};

export default config;
