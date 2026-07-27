// Controllable stand-in for the real `swUpdate` store. A `$state` object so a
// consumer test can flip `available` and assert re-renders; `register` and
// `applyUpdate` are spies.

import { vi } from 'vitest';

export const swUpdate = $state<{
	available: boolean;
	register: () => Promise<void>;
	applyUpdate: () => void;
}>({
	available: false,
	register: vi.fn(async (): Promise<void> => {}),
	applyUpdate: vi.fn((): void => {})
});
