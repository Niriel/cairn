import { http, HttpResponse } from 'msw';
import { tick } from 'svelte';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { goto } from '$app/navigation';
import { server } from '$lib/test/server';
import { render } from '$lib/test/render';
import { bootSession, session, setSignedIn } from '$lib/shared/state/session.svelte';

import Page from './+page.svelte';

vi.mock('$app/state', async () => await import('$lib/test/app-state-mock.svelte'));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/shared/state/session.svelte');

beforeAll(() => {
	vi.stubEnv('VITE_AUTH_BASE', '/auth');
});

afterAll(() => {
	vi.unstubAllEnvs();
});

beforeEach(() => {
	session.current = { status: 'signed-out' };
	// Reset URL between tests; the page reads window.location.hash.
	history.replaceState({}, '', '/auth/callback');
});

afterEach(() => {
	vi.clearAllMocks();
});

const SEED_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'dev@example.test' };

function setCallbackHash(hash: string) {
	history.replaceState({}, '', `/auth/callback${hash}`);
}

describe('/auth/callback', () => {
	test('(a) strips the hash from the URL before any HTTP fires', async () => {
		let hashAtRequest: string | null = null;
		server.use(
			http.post('*/auth/token', () => {
				hashAtRequest = window.location.hash;
				return HttpResponse.json({
					token_type: 'bearer',
					expires_in: 604800,
					user: SEED_USER
				});
			})
		);
		setCallbackHash('#access_token=at&refresh_token=rt-123&type=magiclink');
		render(Page);
		await vi.waitFor(() => {
			expect(hashAtRequest).not.toBeNull();
		});
		expect(hashAtRequest).toBe('');
		// And the URL itself no longer has the hash.
		expect(window.location.hash).toBe('');
	});

	test('(b) POSTs /auth/token?grant_type=refresh_token with {refresh_token} from the hash', async () => {
		let seenBody: unknown = null;
		let seenSearch: string | null = null;
		server.use(
			http.post('*/auth/token', async ({ request }) => {
				const url = new URL(request.url);
				seenSearch = url.search;
				seenBody = await request.json();
				return HttpResponse.json({
					token_type: 'bearer',
					expires_in: 604800,
					user: SEED_USER
				});
			})
		);
		setCallbackHash('#access_token=at&refresh_token=rt-123&type=magiclink');
		render(Page);
		await vi.waitFor(() => {
			expect(seenBody).toEqual({ refresh_token: 'rt-123' });
		});
		expect(seenSearch).toBe('?grant_type=refresh_token');
	});

	test('(c) on 200, calls setSignedIn(user) THEN goto("/", {replaceState: true})', async () => {
		server.use(
			http.post('*/auth/token', () =>
				HttpResponse.json({
					token_type: 'bearer',
					expires_in: 604800,
					user: SEED_USER
				})
			)
		);
		setCallbackHash('#access_token=at&refresh_token=rt-123&type=magiclink');
		render(Page);
		await vi.waitFor(() => {
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/', { replaceState: true });
		});
		expect(vi.mocked(setSignedIn)).toHaveBeenCalledWith(SEED_USER);

		const setSignedInOrder = vi.mocked(setSignedIn).mock.invocationCallOrder[0];
		const gotoOrder = vi.mocked(goto).mock.invocationCallOrder[0];
		expect(setSignedInOrder).toBeLessThan(gotoOrder);
	});

	test('(d) on 401, renders error state with "Back to sign in" affordance; no setSignedIn, no goto', async () => {
		server.use(http.post('*/auth/token', () => new HttpResponse(null, { status: 401 })));
		setCallbackHash('#access_token=at&refresh_token=stale&type=magiclink');
		const { queryByDataTest } = render(Page);
		await vi.waitFor(() => {
			expect(queryByDataTest('callback-error-back')).not.toBeNull();
		});
		expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(e) on 503, renders error state; no setSignedIn, no goto', async () => {
		server.use(http.post('*/auth/token', () => new HttpResponse(null, { status: 503 })));
		setCallbackHash('#access_token=at&refresh_token=rt&type=magiclink');
		const { queryByDataTest } = render(Page);
		await vi.waitFor(() => {
			expect(queryByDataTest('callback-error-back')).not.toBeNull();
		});
		expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(f) on network failure, renders error state; no setSignedIn, no goto', async () => {
		server.use(http.post('*/auth/token', () => HttpResponse.error()));
		setCallbackHash('#access_token=at&refresh_token=rt&type=magiclink');
		const { queryByDataTest } = render(Page);
		await vi.waitFor(() => {
			expect(queryByDataTest('callback-error-back')).not.toBeNull();
		});
		expect(vi.mocked(setSignedIn)).not.toHaveBeenCalled();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(g) missing hash: renders error state, does not call /auth/token', async () => {
		const tokenHandler = vi.fn(() => HttpResponse.json({ user: SEED_USER }));
		server.use(http.post('*/auth/token', tokenHandler));
		// No setCallbackHash — beforeEach clears the URL to /auth/callback.
		const { queryByDataTest } = render(Page);
		await vi.waitFor(() => {
			expect(queryByDataTest('callback-error-back')).not.toBeNull();
		});
		expect(tokenHandler).not.toHaveBeenCalled();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(h) error param in hash: renders error state, does not call /auth/token', async () => {
		const tokenHandler = vi.fn(() => HttpResponse.json({ user: SEED_USER }));
		server.use(http.post('*/auth/token', tokenHandler));
		setCallbackHash('#error=access_denied&error_description=otp_expired');
		const { queryByDataTest } = render(Page);
		await vi.waitFor(() => {
			expect(queryByDataTest('callback-error-back')).not.toBeNull();
		});
		expect(tokenHandler).not.toHaveBeenCalled();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(i) non-magiclink type (e.g. recovery): renders error state, does not call /auth/token', async () => {
		const tokenHandler = vi.fn(() => HttpResponse.json({ user: SEED_USER }));
		server.use(http.post('*/auth/token', tokenHandler));
		setCallbackHash('#access_token=at&refresh_token=rt&type=recovery');
		const { queryByDataTest } = render(Page);
		await vi.waitFor(() => {
			expect(queryByDataTest('callback-error-back')).not.toBeNull();
		});
		expect(tokenHandler).not.toHaveBeenCalled();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	test('(j) signed-in short-circuit at mount: goto("/") without calling /auth/token', async () => {
		session.current = { status: 'signed-in', user: SEED_USER };
		const tokenHandler = vi.fn(() => HttpResponse.json({ user: SEED_USER }));
		server.use(http.post('*/auth/token', tokenHandler));
		setCallbackHash('#access_token=at&refresh_token=stale&type=magiclink');
		render(Page);
		await vi.waitFor(() => {
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/', { replaceState: true });
		});
		expect(tokenHandler).not.toHaveBeenCalled();
	});

	test('(k) boot-race short-circuit: bootSession resolves to signed-in mid-mount → goto, no /auth/token', async () => {
		session.current = { status: 'unknown' };
		vi.mocked(bootSession).mockImplementationOnce(async () => {
			await tick();
			session.current = { status: 'signed-in', user: SEED_USER };
		});
		const tokenHandler = vi.fn(() => HttpResponse.json({ user: SEED_USER }));
		server.use(http.post('*/auth/token', tokenHandler));
		setCallbackHash('#access_token=at&refresh_token=stale&type=magiclink');
		render(Page);
		await vi.waitFor(() => {
			expect(vi.mocked(goto)).toHaveBeenCalledWith('/', { replaceState: true });
		});
		expect(tokenHandler).not.toHaveBeenCalled();
	});
});
