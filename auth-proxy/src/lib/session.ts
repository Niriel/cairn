// Refresh-token exchange against GoTrue, with a three-way result so the
// /auth/refresh handler can tell an authoritative revocation (clear cookies +
// sign out) apart from a transient upstream blip (leave cookies intact). See
// Task 1.3: boot always refreshes, so a 5xx that cleared the durable cookie
// would force a needless re-auth, and a lost response after GoTrue already
// rotated could later trip reuse-detection into a spurious global revoke.

// Config is read per-request (not cached at module load) so tests can point
// GOTRUE_URL at a stub server after the module is imported. Mirrors index.ts.
function gotrueUrl(): string {
	return process.env.GOTRUE_URL ?? 'http://gotrue:9999';
}

export type RefreshResult =
	| { status: 'ok'; accessToken: string; refreshToken: string; expiresIn?: number; user: unknown }
	// authoritative: refresh token invalid / reuse-detected / revoked-family.
	| { status: 'revoked' }
	// transient: GoTrue 5xx or unreachable upstream — do NOT clear cookies.
	| { status: 'unavailable' };

export async function refresh(refreshToken: string): Promise<RefreshResult> {
	let upstream: globalThis.Response;
	try {
		upstream = await fetch(`${gotrueUrl()}/token?grant_type=refresh_token`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ refresh_token: refreshToken })
		});
	} catch {
		// Unreachable upstream — transient, never log the token (docs/logging.md).
		return { status: 'unavailable' };
	}

	// A 5xx is a GoTrue-side failure, not a verdict on the token.
	if (upstream.status >= 500) return { status: 'unavailable' };

	// Any other non-200 (notably 400 invalid_grant / Already Used) is an
	// authoritative rejection of the refresh token.
	if (upstream.status !== 200) return { status: 'revoked' };

	let json: {
		access_token?: unknown;
		refresh_token?: unknown;
		expires_in?: unknown;
		user?: unknown;
	};
	try {
		json = (await upstream.json()) as typeof json;
	} catch {
		return { status: 'unavailable' };
	}

	if (typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string') {
		return { status: 'unavailable' };
	}

	return {
		status: 'ok',
		accessToken: json.access_token,
		refreshToken: json.refresh_token,
		expiresIn: typeof json.expires_in === 'number' ? json.expires_in : undefined,
		user: json.user
	};
}
