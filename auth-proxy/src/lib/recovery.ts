// Recovery code helpers and the scoped-role PostgREST client for the auth BFF.
//
// The signed-out reset RPCs (request_password_reset / reset_password) are granted
// ONLY to the cairn_auth_bff role — never anon or authenticated — so the BFF
// reaches them by attaching a pre-minted role JWT (AUTH_BFF_DB_JWT) that carries
// {"role":"cairn_auth_bff"}. Returning the private on-file address and writing the
// password are safe only because these RPCs are off the public PostgREST surface.
//
// The BFF generates the 6-digit code, mails the plaintext to the user, and passes
// only its SHA-256 hash to the DB — so the code never enters a database query log.
// Never log the code, address, or JWT (docs/logging.md).

import { createHash, randomInt } from 'node:crypto';

// Read per-call (not cached at import) so tests can point these at a stub server.
function postgrestUrl(): string {
	return process.env.POSTGREST_URL ?? 'http://postgrest:3000';
}
function bffJwt(): string {
	return process.env.AUTH_BFF_DB_JWT ?? '';
}

// A uniformly-distributed 6-digit code, leading zeros preserved (randomInt is
// crypto-strong and unbiased, unlike Math.random() % 1e6).
export function generateCode(): string {
	return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// SHA-256 hex of the code. This is log hygiene, NOT secrecy at rest — a SHA-256
// over a 10^6 space is trivially reversible; the code's real protection is that
// the token table lives in the unreachable auth_private schema (see the DB RPCs).
export function hashCode(code: string): string {
	return createHash('sha256').update(code, 'utf8').digest('hex');
}

// One scoped RPC call as the cairn_auth_bff role. Scalar-returning functions
// (RETURNS text) come back as a bare JSON value, so `value` is the string the
// function returned, or null. On a non-2xx, `code` carries the SQLSTATE PostgREST
// echoes so the callers can distinguish CA429 / 23514 from a generic failure.
type ScopedResult = { ok: true; value: unknown } | { ok: false; code: string | null };

async function callScopedRpc(name: string, args: unknown): Promise<ScopedResult> {
	let res: globalThis.Response;
	try {
		res = await fetch(`${postgrestUrl()}/rpc/${name}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				Authorization: `Bearer ${bffJwt()}`
			},
			body: JSON.stringify(args)
		});
	} catch {
		return { ok: false, code: null };
	}
	if (res.ok) {
		let value: unknown;
		try {
			value = await res.json();
		} catch {
			value = null;
		}
		return { ok: true, value };
	}
	let code: string | null = null;
	try {
		const body = (await res.json()) as { code?: unknown };
		if (typeof body.code === 'string') code = body.code;
	} catch {
		// Non-JSON error body — leave code null; callers map it to a generic error.
	}
	return { ok: false, code };
}

// request_password_reset returns the on-file recovery address (so the BFF knows
// where to mail the code), or null when the username is unknown or has no
// recovery e-mail. CA429 is the per-address send cap.
export type ResetRequestResult =
	| { status: 'sent'; email: string }
	| { status: 'none' }
	| { status: 'throttled' }
	| { status: 'error' };

export async function requestPasswordReset(
	username: string,
	codeHash: string
): Promise<ResetRequestResult> {
	const r = await callScopedRpc('request_password_reset', {
		p_username: username,
		p_code_hash: codeHash
	});
	if (!r.ok) return r.code === 'CA429' ? { status: 'throttled' } : { status: 'error' };
	if (typeof r.value === 'string') return { status: 'sent', email: r.value };
	return { status: 'none' };
}

// reset_password returns a status string; a too-short password (correct code)
// raises 23514, which PostgREST surfaces as an error body with that SQLSTATE.
export type ResetResult =
	| { status: 'ok' }
	| { status: 'invalid' }
	| { status: 'locked' }
	| { status: 'too_short' }
	| { status: 'error' };

export async function resetPassword(
	username: string,
	codeHash: string,
	newPassword: string
): Promise<ResetResult> {
	const r = await callScopedRpc('reset_password', {
		p_username: username,
		p_code_hash: codeHash,
		p_new_password: newPassword
	});
	if (!r.ok) return r.code === '23514' ? { status: 'too_short' } : { status: 'error' };
	if (r.value === 'ok' || r.value === 'invalid' || r.value === 'locked') {
		return { status: r.value };
	}
	return { status: 'error' };
}
