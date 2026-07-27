// Cache Storage bucket-name prefixes, shared between the PWA service worker
// (which builds versioned names from them) and the session store (which purges
// the api bucket on sign-out / account-switch). Lives in `shared/` so both the
// `pwa/` domain and `shared/state/session` can import it without a sideways
// per-domain import (docs/frontend-layout.md: shared/ must not import from a
// per-domain folder).

export const SHELL_CACHE_PREFIX = 'cairn-shell-';
export const API_CACHE_PREFIX = 'cairn-api-';
