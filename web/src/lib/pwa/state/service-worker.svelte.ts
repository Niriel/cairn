// Owns the service-worker update lifecycle. SvelteKit's auto-registration is
// off (`serviceWorker.register: false` in svelte.config.js) so this module
// registers the worker itself (production only), detects a waiting new
// version, and drives the "A new version is available" prompt.

let available = $state(false);

// The installed-and-waiting worker, captured so `applyUpdate()` can tell it
// to take over. Null until an update is detected.
let waiting: ServiceWorker | null = null;

// Reload exactly once when a *new* worker takes control, guarding against a
// second reload if `controllerchange` fires again.
let reloading = false;

export const swUpdate = {
	get available(): boolean {
		return available;
	},

	register: async (): Promise<void> => {
		// Inert in `pnpm dev` (docs/development.md) — constant cache
		// invalidation during development is more annoying than useful.
		if (import.meta.env.DEV) return;
		if (!('serviceWorker' in navigator)) return;

		// Whether a worker already controlled this page when it loaded. Only then
		// is a takeover an *update*, where the assets this page is running are the
		// old version and a reload is the point. On a first install there is no
		// controller, yet the worker's `clients.claim()` fires `controllerchange`
		// all the same — reloading on that would bounce every visitor's first page
		// load, mid-form and all, to no end: nothing it fetched is stale.
		const wasControlled = navigator.serviceWorker.controller !== null;

		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (!wasControlled || reloading) return;
			reloading = true;
			location.reload();
		});

		const registration = await navigator.serviceWorker.register('/service-worker.js');

		// A worker already installed and waiting (the update landed before this
		// tab loaded). `controller` being present means this is an update, not a
		// first install.
		if (registration.waiting && navigator.serviceWorker.controller) {
			waiting = registration.waiting;
			available = true;
		}

		registration.addEventListener('updatefound', () => {
			const installing = registration.installing;
			if (!installing) return;
			installing.addEventListener('statechange', () => {
				// `installed` + an existing controller = an update ready to apply.
				// Without a controller this is the first install, which needs no
				// prompt (nothing stale is being served).
				if (installing.state === 'installed' && navigator.serviceWorker.controller) {
					waiting = installing;
					available = true;
				}
			});
		});
	},

	applyUpdate: (): void => {
		// The new worker calls skipWaiting() on receipt, activates, and fires
		// `controllerchange` — which triggers the one-shot reload wired above.
		waiting?.postMessage({ type: 'SKIP_WAITING' });
	}
};
