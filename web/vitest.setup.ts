import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { server } from './src/lib/test/server';

// SvelteKit's pushState throws "router not initialized" outside an SSR /
// browser app. back-stack.svelte.ts uses it for the back-button-guard
// marker; tests that exercise the real back-stack (Accordion, Sheet,
// ItemsScreen) need it to be a no-op. Tests that want to assert on it
// can `vi.mocked(pushState)` after re-importing from '$app/navigation'.
vi.mock('$app/navigation', async () => {
	const actual = await vi.importActual<typeof import('$app/navigation')>('$app/navigation');
	return {
		...actual,
		pushState: vi.fn()
	};
});

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
	cleanup();
	server.resetHandlers();
});
afterAll(() => server.close());
