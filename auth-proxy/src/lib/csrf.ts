import type { Request } from 'express';

import { CSRF_HEADER } from './auth-paths.js';

// CSRF defence for the Cairn-shaped state-changing endpoints (/auth/refresh,
// /auth/signout, and the 2003 /auth/signin + /auth/register). On top of the
// cookies' SameSite=Lax, a state-changing request must carry an explicit custom
// header. A cross-origin attacker cannot set a custom header on a request
// without a CORS preflight, and the BFF grants no such preflight (it sets
// no Access-Control-Allow-* headers — see index.ts), so the header's mere
// presence is sufficient: there is no value to validate.
//
// Only the Cairn-shaped endpoints above — which plant, rotate, or clear the
// dual-cookie session — are gated. Every other /auth request gets a 404 (there
// is no GoTrue pass-through), so there is nothing else to protect.
export function requireCsrf(req: Request): boolean {
	return req.get(CSRF_HEADER) !== undefined;
}
