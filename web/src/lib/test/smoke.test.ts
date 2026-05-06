import { describe, expect, it } from 'vitest';

// Smoke test to prove the Vitest harness is wired up. Replace with real
// tests as src/lib/ grows. See ../../../../docs/testing.md.
describe('test harness', () => {
	it('runs', () => {
		expect(1 + 1).toBe(2);
	});

	it('has a DOM environment (happy-dom)', () => {
		expect(typeof document).toBe('object');
		expect(document.createElement('div').tagName).toBe('DIV');
	});
});
