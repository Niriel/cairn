/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';

// `self` is typed as the plain worker global by default; narrow it to the
// service-worker flavour so `skipWaiting`, `clients`, and the event types
// resolve.
const sw = self as unknown as ServiceWorkerGlobalScope;

const SHELL_CACHE = 'cairn-shell-' + version;

// Everything the app shell needs to boot offline. `'/'` is the SPA fallback
// (`index.html`), which is not present in `build` or `files`.
const SHELL_ASSETS = ['/', ...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
		// No skipWaiting() — a waiting worker is what the update prompt surfaces.
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const name of await caches.keys()) {
				if (name !== SHELL_CACHE) await caches.delete(name);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') sw.skipWaiting();
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Navigations: serve the cached shell, falling back to the network.
	if (request.mode === 'navigate') {
		event.respondWith(
			caches.open(SHELL_CACHE).then(async (cache) => (await cache.match('/')) ?? fetch(request))
		);
		return;
	}

	// Same-origin precached assets: cache-first. Everything else (including
	// `/api`, until Phase 3's SWR router) falls through to the network.
	if (url.origin === location.origin) {
		event.respondWith(
			caches.open(SHELL_CACHE).then(async (cache) => (await cache.match(request)) ?? fetch(request))
		);
	}
});
