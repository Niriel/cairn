/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';
import {
	apiCache,
	classifyApiRequest,
	isApiWrite,
	isStale,
	markStale,
	MRU_SENTINEL_KEY,
	offlineResponse,
	servesShell,
	shellCache,
	shouldKeepOnPurge,
	shouldMarkStaleOnWrite,
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

	// Cross-origin falls through to the network untouched.
	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	// Writes always go to the network — never cached, never served from cache, so
	// an offline write fails naturally rather than being silently swallowed. A
	// write that *succeeds*, though, has just made the cached reads stale, so it
	// invalidates them on the way back.
	if (request.method !== 'GET') {
		if (isApiWrite(request.method, url)) event.respondWith(writeThrough(request));
		return;
	}

	// Navigations to app routes: serve the cached shell, falling back to the
	// network. A navigation to a static file (e.g. the licence texts, which are
	// not precached) falls through to the network untouched.
	if (request.mode === 'navigate' && servesShell(url)) {
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

/**
 * A write, straight to the network, marking the cached reads it may have
 * outdated. Without this the stale-while-revalidate reads below would answer the
 * refetch the app fires immediately after a mutation with the pre-write
 * response — and since a store reads only that first response and never sees
 * the background revalidation, a list you just created would stay invisible.
 *
 * `fetch` is deliberately not caught: offline it rejects, and the caller sees
 * the same failed fetch it would see with no worker at all.
 */
async function writeThrough(request: Request): Promise<Response> {
	const response = await fetch(request);
	// Only a landed write invalidates: one the server rejected (RLS, validation)
	// changed nothing.
	if (response.ok) await markApiCacheStale();
	return response;
}

/** Flag every cached api read for a network-first confirmation on next use. */
async function markApiCacheStale(): Promise<void> {
	const cache = await caches.open(API_CACHE);
	for (const req of await cache.keys()) {
		if (!shouldMarkStaleOnWrite(new URL(req.url))) continue;
		const cached = await cache.match(req);
		if (cached && !isStale(cached)) await cache.put(req, markStale(cached));
	}
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

	// The steady state: answer from cache now, refresh in the background.
	if (cached && !isStale(cached)) {
		event.waitUntil(revalidate);
		return cached;
	}
	// A write has landed behind this entry's back (or there is nothing cached):
	// confirm with the server first. The cached copy is still the right answer
	// when the network is gone — it's the offline read the cache exists for.
	return (await revalidate) ?? cached ?? offlineResponse();
}
