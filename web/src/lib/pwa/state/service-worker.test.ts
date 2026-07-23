import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// A fresh module per test: the store holds module-level `$state` and wires
// event listeners in `register()`, so each case re-imports to avoid leaking
// `available`/listeners across tests.
async function freshStore() {
	vi.resetModules();
	return (await import('./service-worker.svelte')).swUpdate;
}

type FakeWorker = EventTarget & { state: string; postMessage: ReturnType<typeof vi.fn> };
type FakeRegistration = EventTarget & {
	installing: FakeWorker | null;
	waiting: FakeWorker | null;
};

function makeWorker(state = 'installing'): FakeWorker {
	const w = new EventTarget() as FakeWorker;
	w.state = state;
	w.postMessage = vi.fn();
	return w;
}

let registration: FakeRegistration;
let controller: FakeWorker | null;
let registerSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
	registration = Object.assign(new EventTarget(), {
		installing: null as FakeWorker | null,
		waiting: null as FakeWorker | null
	});
	controller = null;
	registerSpy = vi.fn(() => Promise.resolve(registration));

	const container = new EventTarget() as EventTarget & {
		register: typeof registerSpy;
		controller: FakeWorker | null;
	};
	container.register = registerSpy;
	Object.defineProperty(container, 'controller', { get: () => controller });

	Object.defineProperty(navigator, 'serviceWorker', {
		value: container,
		configurable: true
	});
});

afterEach(() => {
	vi.unstubAllEnvs();
	// @ts-expect-error — remove the stubbed container between tests.
	delete navigator.serviceWorker;
});

describe('swUpdate', () => {
	test('register() is a no-op in dev', async () => {
		vi.stubEnv('DEV', true);
		const swUpdate = await freshStore();
		await swUpdate.register();
		expect(registerSpy).not.toHaveBeenCalled();
		expect(swUpdate.available).toBe(false);
	});

	test('an installed new worker with an existing controller sets available', async () => {
		vi.stubEnv('DEV', false);
		const swUpdate = await freshStore();
		await swUpdate.register();
		expect(registerSpy).toHaveBeenCalledWith('/service-worker.js');

		// An update, not a first install: a controller already runs this page.
		controller = makeWorker('activated');
		const incoming = makeWorker('installing');
		registration.installing = incoming;
		registration.dispatchEvent(new Event('updatefound'));
		incoming.state = 'installed';
		incoming.dispatchEvent(new Event('statechange'));

		expect(swUpdate.available).toBe(true);
	});

	test('a first install (no controller) does not set available', async () => {
		vi.stubEnv('DEV', false);
		const swUpdate = await freshStore();
		await swUpdate.register();

		controller = null; // first install: nothing controls the page yet
		const incoming = makeWorker('installing');
		registration.installing = incoming;
		registration.dispatchEvent(new Event('updatefound'));
		incoming.state = 'installed';
		incoming.dispatchEvent(new Event('statechange'));

		expect(swUpdate.available).toBe(false);
	});

	test('an already-waiting worker with a controller sets available immediately', async () => {
		vi.stubEnv('DEV', false);
		controller = makeWorker('activated');
		registration.waiting = makeWorker('installed');
		const swUpdate = await freshStore();
		await swUpdate.register();
		expect(swUpdate.available).toBe(true);
	});

	test('applyUpdate() posts SKIP_WAITING to the waiting worker', async () => {
		vi.stubEnv('DEV', false);
		controller = makeWorker('activated');
		const waiting = makeWorker('installed');
		registration.waiting = waiting;
		const swUpdate = await freshStore();
		await swUpdate.register();

		swUpdate.applyUpdate();
		expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
	});
});
