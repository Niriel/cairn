import { http, HttpResponse, type RequestHandler } from 'msw';

// PostgREST and GoTrue mock handlers go here.
// Tests can override individual handlers via `server.use(...)`.
// See docs/testing.md → "Mocking the API" for the rationale.
//
// Defaults represent the "logged out / fresh start" state so unrelated tests
// don't accidentally render an authed view. The `*/path` wildcard-origin
// pattern is MSW v2's documented cross-origin form and matches regardless of
// the origin happy-dom resolves a relative `fetch('/auth/user')` against.
export const handlers: RequestHandler[] = [
	// Boot resolves the session via POST /auth/refresh now (not GET /auth/user).
	// A 401 here is the authoritative "no session" answer for the fresh-start
	// default, so unrelated tests render the logged-out view.
	http.post('*/auth/refresh', () => new HttpResponse(null, { status: 401 })),
	http.get('*/auth/user', () => new HttpResponse(null, { status: 401 })),
	http.post('*/auth/signout', () => new HttpResponse(null, { status: 204 })),
	// Path-only pattern — MSW v2 query-string wildcard behaviour is unreliable
	http.get('*/api/profiles', () =>
		HttpResponse.json(
			{ display_name: 'Alice', avatar_version: 0 },
			{ headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } }
		)
	),
	http.post('*/api/rpc/create_list', () =>
		HttpResponse.json({
			id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			name: 'My list',
			description: null,
			modified_at: '2026-01-01T00:00:00Z'
		})
	),
	http.get('*/api/lists', () => HttpResponse.json([])),
	http.get('*/api/items_ranked', () => HttpResponse.json([])),
	http.get('*/api/votes', () => HttpResponse.json([])),
	http.post('*/api/items', () =>
		HttpResponse.json(
			{
				id: 'stub-item-id',
				list_id: 'stub-list-id',
				name: 'Stub item',
				notes: null,
				created_by: 'stub-user-id',
				modified_by: 'stub-user-id',
				score: 0,
				created_at: '2026-01-01T00:00:00Z',
				modified_at: '2026-01-01T00:00:00Z',
				created_by_profile: { display_name: 'Stub user' },
				modified_by_profile: null
			},
			{ status: 201 }
		)
	),
	http.patch('*/api/items', () => new HttpResponse(null, { status: 204 })),
	http.patch('*/api/lists', () => new HttpResponse(null, { status: 204 })),
	http.post('*/api/votes', () => new HttpResponse(null, { status: 200 })),
	http.delete('*/api/votes', () => new HttpResponse(null, { status: 204 })),
	http.post('*/api/rpc/set_display_name', () => new HttpResponse(null, { status: 204 })),
	http.post('*/api/rpc/clear_avatar', () => new HttpResponse(null, { status: 204 })),
	http.post('*/api/rpc/delete_account', () => new HttpResponse(null, { status: 204 })),
	http.post('*/avatars', () => HttpResponse.json({ version: 1, url: '/avatars/test.webp?v=1' })),
	http.delete('*/avatars/me', () => HttpResponse.json({ ok: true }))
];
