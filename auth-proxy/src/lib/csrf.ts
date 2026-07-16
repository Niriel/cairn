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
// The generic GoTrue pass-through sits outside this check: it plants no session
// cookie, so there is nothing for a CSRF header to reinforce there. Only the
// Cairn-shaped endpoints above — which plant, rotate, or clear the dual-cookie
// session — are gated.
export function requireCsrf(req: Request): boolean {
	return req.get(CSRF_HEADER) !== undefined;
}
