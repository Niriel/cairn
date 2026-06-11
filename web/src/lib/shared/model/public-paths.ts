// Routes a signed-out visitor may view without being bounced to /auth/login.
// These are static, auth-independent content pages (operator/legal info),
// deliberately kept separate from the auth-flow paths in `auth-paths.ts` —
// that file is mirrored verbatim in the production auth-proxy and guarded
// against drift, so content routes must NOT be added there.
// `/p` covers the read-only public-list view (`/p/<list_id>`): a signed-out
// visitor with the link sees the list without being bounced to /auth/login.
export const PUBLIC_CONTENT_PATHS = ['/imprint', '/p'] as const;
