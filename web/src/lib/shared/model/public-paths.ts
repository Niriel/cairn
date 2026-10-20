// Routes a signed-out visitor may view without being bounced to /auth/signin.
// These are static, auth-independent content pages (operator/legal info),
// deliberately kept separate from the auth-flow paths in `auth-paths.ts` —
// that file is mirrored verbatim in the production auth-proxy and guarded
// against drift, so content routes must NOT be added there.
// `/about` covers the About hub and every legal page beneath it (privacy
// policy, terms, imprint, …): the privacy notice must be readable before
// anyone signs up. The legacy `/imprint` needs no entry: its `load` redirects
// to `/about/imprint` in the client router, before this guard sees the URL.
// `/p` covers the read-only public-list view (`/p/<list_id>`): a signed-out
// visitor with the link sees the list without being bounced to /auth/signin.
export const PUBLIC_CONTENT_PATHS = ['/about', '/p'] as const;
