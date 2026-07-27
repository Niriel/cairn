/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';
import {
	apiCache,
	classifyApiRequest,
	MRU_SENTINEL_KEY,
	shellCache,
	shouldKeepOnPurge,
	shouldPurgeForEntry
} from '$lib/pwa/model/sw-cache';

// `self` is typed as the plain worker global by default; narrow it to the
// service-worker flavour so `skipWaiting`, `clients`, and the event types
// resolve.
const sw = self as unknown as ServiceWorkerGlobalScope;

const SHELL_CACHE = shellCache(version);
const API_CACHE = apiCache(version);

// Everything the app shell needs to boot offline. `'/'` is the SPA fallback
// (`index.html`), which is not present in `build` or `files`.
const SHELL_ASSETS = ['/', ...build, ...files];
const SHELL_PATHS = new Set(SHELL_ASSETS);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
		// No skipWaiting() — a waiting worker is what the update prompt surfaces.
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Keep BOTH this version's shell and api caches; drop everything else.
			// (A same-version activate must not wipe the api cache the router is
			// populating.)
			const keep = new Set([SHELL_CACHE, API_CACHE]);
			for (const name of await caches.keys()) {
				if (!keep.has(name)) await caches.delete(name);
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
	// Non-GET (writes) and cross-origin fall through to the network untouched, so
	// offline writes fail naturally rather than being silently swallowed.
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	// Navigations: serve the cached shell, falling back to the network.
	if (request.mode === 'navigate') {
		event.respondWith(
			caches.open(SHELL_CACHE).then(async (cache) => (await cache.match('/')) ?? fetch(request))
		);
		return;
	}

	// Precached shell assets: cache-first.
	if (SHELL_PATHS.has(url.pathname)) {
		event.respondWith(
			caches.open(SHELL_CACHE).then(async (cache) => (await cache.match(request)) ?? fetch(request))
		);
		return;
	}

	// Cacheable /api GETs: stale-while-revalidate.
	const cls = classifyApiRequest(url);
	if (cls !== null) {
		event.respondWith(handleApi(event, cls));
		return;
	}

	// Everything else (/auth, /avatars reads, unclassified /api) → network
	// passthrough, never cached: no respondWith.
});

/** A clean 503 so `postgrest.ts` throws a typed ApiError, not a raw reject. */
function offlineResponse(): Response {
	return new Response(JSON.stringify({ code: 'offline' }), {
		status: 503,
		headers: { 'content-type': 'application/json' }
	});
}

/** The stored most-recently-viewed list id, or null if none yet. */
async function readEpoch(cache: Cache): Promise<string | null> {
	const res = await cache.match(MRU_SENTINEL_KEY);
	if (!res) return null;
	const text = await res.text();
	return text || null;
}

/** Delete the prior list's api entries, keeping the overview, the sentinel, and
 *  anything already attributed to the incoming list (a raced-ahead meta). */
async function purgeForEntry(cache: Cache, incomingListId: string): Promise<void> {
	const keys = await cache.keys();
	await Promise.all(
		keys.map((req) =>
			shouldKeepOnPurge(new URL(req.url), incomingListId)
				? Promise.resolve(false)
				: cache.delete(req)
		)
	);
}

async function handleApi(
	event: FetchEvent,
	cls: Exclude<ReturnType<typeof classifyApiRequest>, null>
): Promise<Response> {
	const { request } = event;
	const cache = await caches.open(API_CACHE);

	// Entering a new list: purge the previous list's rows, then record the epoch.
	if (cls !== 'overview' && cls.isEntry && cls.listId) {
		const storedEpoch = await readEpoch(cache);
		if (shouldPurgeForEntry(storedEpoch, cls.listId)) {
			await purgeForEntry(cache, cls.listId);
			await cache.put(MRU_SENTINEL_KEY, new Response(cls.listId));
		}
	}

	const cached = await cache.match(request);

	// Background revalidate. The `.catch` swallows the offline reject so it is
	// not an unhandled rejection; only `ok` responses are written to the cache.
	const revalidate = fetch(request)
		.then(async (response) => {
			if (response.ok) await cache.put(request, response.clone());
			return response;
		})
		.catch(() => undefined);

	if (cached) {
		event.waitUntil(revalidate);
		return cached;
	}
	return (await revalidate) ?? offlineResponse();
}
