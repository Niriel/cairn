import { afterEach, describe, expect, test, vi } from 'vitest';

// Fresh module per case: the store reads navigator.onLine and wires window
// listeners at import time, so re-import after stubbing to test the initial
// value.
async function freshNetwork() {
	vi.resetModules();
	return (await import('./network.svelte')).network;
}

function stubOnLine(value: boolean) {
	Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

describe('network store', () => {
	afterEach(() => stubOnLine(true));

	test('initial online tracks navigator.onLine when true', async () => {
		stubOnLine(true);
		const network = await freshNetwork();
		expect(network.online).toBe(true);
	});

	test('initial online tracks navigator.onLine when false', async () => {
		stubOnLine(false);
		const network = await freshNetwork();
		expect(network.online).toBe(false);
	});

	test('offline and online events flip network.online', async () => {
		stubOnLine(true);
		const network = await freshNetwork();
		expect(network.online).toBe(true);

		window.dispatchEvent(new Event('offline'));
		expect(network.online).toBe(false);

		window.dispatchEvent(new Event('online'));
		expect(network.online).toBe(true);
	});
});
