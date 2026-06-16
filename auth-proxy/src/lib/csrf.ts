import type { Request } from 'express';

import { CSRF_HEADER } from './auth-paths.js';

// CSRF defence for the Cairn-shaped state-changing endpoints (/auth/refresh,
// /auth/signout, and the 2003 /auth/signin + /auth/register). On top of the
// cookies' SameSite=Lax, a state-changing request must carry an explicit custom
// header. A cross-origin attacker cannot set a custom header on a request
// without a CORS preflight, and the BFF grants no such preflight (it forwards
// no Access-Control-Allow-* headers — see index.ts), so the header's mere
// presence is sufficient: there is no value to validate.
//
// The magic-link pass-through endpoints (/auth/magiclink, /auth/verify,
// /auth/token) are GoTrue's own wire protocol kept alive for the magic-link
// flow; they establish a session from the request body, not the cookie, so
// SameSite does not protect them and they sit outside this check. The residual
// login-CSRF on that path is deliberately accepted (see REQUIREMENTS.md
// Non-requirements) and retires when magic-link does.
export function requireCsrf(req: Request): boolean {
	return req.get(CSRF_HEADER) !== undefined;
}
