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

// Look up the stored (case-preserving) username for a uid, as the
// authenticated bearer — profiles_select permits reading any profile. Used to
// enrich a user-returning response with the username the GoTrue user lacks.
// Returns null when no profile row matches.
export async function usernameForUid(uid: string, accessToken: string): Promise<string | null> {
	const res = await fetch(
		`${postgrestUrl()}/profiles?id=eq.${encodeURIComponent(uid)}&select=username`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);
	if (!res.ok) return null;
	const rows = (await res.json()) as Array<{ username?: unknown }>;
	const row = Array.isArray(rows) ? rows[0] : undefined;
	if (!row || typeof row.username !== 'string') return null;
	return row.username;
}
