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
		paths: {
			// Absolute asset URLs (`/_app/...`), not SvelteKit's relative default.
			// Cairn is served from the domain root behind an index.html fallback, so
			// one document is replayed at every depth — by nginx's `try_files` in
			// production and by the service worker's cached shell offline. Relative
			// paths resolve against the *requested* path, so that same document
			// asks for `/lists/_app/...` and boots into a blank page.
			relative: false
		},
		serviceWorker: {
			// We own the update lifecycle (see src/service-worker.ts and the
			// swUpdate store); adapter-static still compiles the worker.
			register: false
		}
	}
};

export default config;
