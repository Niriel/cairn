// Routes a signed-out visitor may view without being bounced to /auth/login.
// These are static, auth-independent content pages (operator/legal info),
// deliberately kept separate from the auth-flow paths in `auth-paths.ts` —
// that file is mirrored verbatim in the production auth-proxy and guarded
// against drift, so content routes must NOT be added there.
export const PUBLIC_CONTENT_PATHS = ['/imprint'] as const;
