// PostgREST-backed identity helpers for the auth BFF. Sign-in resolves a typed
// username to a user id (the anon-callable resolve_username RPC, before any
// session exists); every user-returning response enriches the bare GoTrue user
// with the username looked up by uid. Both are PostgREST calls — the BFF talks
// to GoTrue for credentials and to PostgREST for identity. Never log the
// username or the bearer (docs/logging.md).

// Config is read per-request (not cached at module load) so tests can point
// POSTGREST_URL at a stub server after the module is imported. Mirrors
// session.ts's gotrueUrl().
function postgrestUrl(): string {
	return process.env.POSTGREST_URL ?? 'http://postgrest:3000';
}

// Resolve a typed username → its account, via the anon-callable
// resolve_username RPC (case-fold index lookup). Runs with NO Authorization
// header — sign-in happens before any session exists. Returns the single
// matching row, or null when the username is free (the RPC returns []).
export async function resolveUsername(
	username: string
): Promise<{ id: string; username: string } | null> {
	const res = await fetch(`${postgrestUrl()}/rpc/resolve_username`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ p_username: username })
	});
	if (!res.ok) return null;
	const rows = (await res.json()) as Array<{ id?: unknown; username?: unknown }>;
	const row = Array.isArray(rows) ? rows[0] : undefined;
	if (!row || typeof row.id !== 'string' || typeof row.username !== 'string') return null;
	return { id: row.id, username: row.username };
}

// Outcome of an authenticated PostgREST RPC write. On failure, `code` carries the
// Postgres SQLSTATE PostgREST echoes in its error body (e.g. '23505' for a
// unique-violation) so the register handler can map the set_username race onto a
// "username taken" 409 and any other error onto a 500.
export type RpcOutcome = { ok: true } | { ok: false; code: string | null };

async function callRpc(name: string, args: unknown, accessToken: string): Promise<RpcOutcome> {
	let res: globalThis.Response;
	try {
		res = await fetch(`${postgrestUrl()}/rpc/${name}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` },
			body: JSON.stringify(args)
		});
	} catch {
		return { ok: false, code: null };
	}
	if (res.ok) return { ok: true };
	let code: string | null = null;
	try {
		const body = (await res.json()) as { code?: unknown };
		if (typeof body.code === 'string') code = body.code;
	} catch {
		// Non-JSON error body — leave code null; the handler maps it to a 500.
	}
	return { ok: false, code };
}

// Set the caller's permanent GoTrue identity to `<uid>@cairn.internal` (the
// adopt_stable_identity RPC, run as the just-signed-up bearer). Idempotent.
export function adoptStableIdentity(accessToken: string): Promise<RpcOutcome> {
	return callRpc('adopt_stable_identity', {}, accessToken);
}

// Set the caller's chosen username (the set_username RPC, run as the bearer). A
// '23505' code means the case-fold uniqueness lost a race — surface as "taken".
export function setUsername(username: string, accessToken: string): Promise<RpcOutcome> {
	return callRpc('set_username', { p_username: username }, accessToken);
}

// Look up the stored (case-preserving) username for a uid, as the
// authenticated bearer — profiles_select permits reading any profile. Used to
// enrich a user-returning response with the username the GoTrue user lacks.
// Returns null when no profile row matches.
export async function usernameForUid(uid: string, accessToken: string): Promise<string | null> {
	try {
		const res = await fetch(
			`${postgrestUrl()}/profiles?id=eq.${encodeURIComponent(uid)}&select=username`,
			{ headers: { Authorization: `Bearer ${accessToken}` } }
		);
		if (!res.ok) return null;
		const rows = (await res.json()) as Array<{ username?: unknown }>;
		const row = Array.isArray(rows) ? rows[0] : undefined;
		if (!row || typeof row.username !== 'string') return null;
		return row.username;
	} catch {
		// Unreachable PostgREST / malformed body — degrade to "no username" rather
		// than throw, so an enriched session-restore path falls back to { id }
		// instead of failing the request (docs/logging.md: never log the token).
		return null;
	}
}
