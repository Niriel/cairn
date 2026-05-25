import { http, HttpResponse, type RequestHandler } from 'msw';

// PostgREST and GoTrue mock handlers go here.
// Tests can override individual handlers via `server.use(...)`.
// See docs/testing.md → "Mocking the API" for the rationale.
//
// Defaults represent the "logged out / fresh start" state so unrelated tests
// don't accidentally render an authed view. The `*/path` wildcard-origin
// pattern is MSW v2's documented cross-origin form and matches regardless of
// the origin happy-dom resolves a relative `fetch('/auth/user')` against.
//
// The `/auth/verify` and `/auth/token` responses mirror the *post-strip* body
// shape — no `access_token`, no `refresh_token` — because the production Vite
// proxy strips both fields before the page sees them (R10 / COOKIE_PLANT_PATHS).
// Keeping the fixture honest means a regression that taught the auth-client to
// read tokens from the body would still fail under this default.
export const handlers: RequestHandler[] = [
	http.get('*/auth/user', () => new HttpResponse(null, { status: 401 })),
	http.post('*/auth/magiclink', () => HttpResponse.json({})),
	http.post('*/auth/verify', () =>
		HttpResponse.json({
			token_type: 'bearer',
			expires_in: 604800,
			user: { id: '11111111-1111-1111-1111-111111111111', email: 'dev@example.test' }
		})
	),
	http.post('*/auth/token', () =>
		HttpResponse.json({
			token_type: 'bearer',
			expires_in: 604800,
			user: { id: '11111111-1111-1111-1111-111111111111', email: 'dev@example.test' }
		})
	),
	http.delete('*/auth/session', () => new HttpResponse(null, { status: 204 })),
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
	http.post('*/api/votes', () => new HttpResponse(null, { status: 200 })),
	http.delete('*/api/votes', () => new HttpResponse(null, { status: 204 }))
];
