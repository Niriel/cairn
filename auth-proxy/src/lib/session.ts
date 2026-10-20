// Refresh-token exchange against GoTrue, with a three-way result so the
// /auth/refresh handler can tell an authoritative revocation (clear cookies +
// sign out) apart from a transient upstream blip (leave cookies intact). See
// Task 1.3: boot always refreshes, so a 5xx that cleared the durable cookie
// would force a needless re-auth, and a lost response after GoTrue already
// rotated could later trip reuse-detection into a spurious global revoke.

// Config is read per-request (not cached at module load) so tests can point
// GOTRUE_URL at a stub server after the module is imported.
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

// Password grant for the Cairn-shaped /auth/signin endpoint. Distinct from the
// refresh-token grant above: this authenticates a stable identity
// (<uid>@cairn.internal) + password against GoTrue's /token?grant_type=password.
// The three-way result mirrors refresh()'s: an authoritative rejection (400,
// wrong password) is reported as a constant-shape credential failure by the
// handler, while a transient upstream blip (5xx/unreachable) must not be. Never
// logs the e-mail, password, or token (docs/logging.md).
export type PasswordGrantResult =
	| { status: 'ok'; accessToken: string; refreshToken: string; expiresIn?: number; user: unknown }
	// authoritative: GoTrue rejected the credentials.
	| { status: 'invalid' }
	// transient: GoTrue 5xx or unreachable upstream.
	| { status: 'unavailable' };

export async function passwordGrant(email: string, password: string): Promise<PasswordGrantResult> {
	let upstream: globalThis.Response;
	try {
		upstream = await fetch(`${gotrueUrl()}/token?grant_type=password`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, password })
		});
	} catch {
		return { status: 'unavailable' };
	}

	// A 5xx is a GoTrue-side failure, not a verdict on the credentials.
	if (upstream.status >= 500) return { status: 'unavailable' };
	// Any other non-200 (notably 400 invalid_grant) is an authoritative reject.
	if (upstream.status !== 200) return { status: 'invalid' };

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

// Account creation for the Cairn-shaped /auth/register endpoint. Signs up against
// GoTrue's /signup with a transient `<random>@cairn.internal` address;
// GOTRUE_MAILER_AUTOCONFIRM=true means the account is confirmed and a token set
// is returned immediately (no inbox round-trip). The register handler then adopts
// the stable identity and sets the chosen username. `disabled` distinguishes the
// operator's GOTRUE_DISABLE_SIGNUP hard switch from a transient outage. Never logs
// the e-mail, password, or token (docs/logging.md).
export type SignupResult =
	| { status: 'ok'; userId: string; accessToken: string; refreshToken: string; expiresIn?: number }
	// GoTrue signups disabled (operator switch).
	| { status: 'disabled' }
	// transient: GoTrue 5xx, unreachable, or a malformed/unexpected response.
	| { status: 'unavailable' };

export async function signup(email: string, password: string): Promise<SignupResult> {
	let upstream: globalThis.Response;
	try {
		upstream = await fetch(`${gotrueUrl()}/signup`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, password })
		});
	} catch {
		return { status: 'unavailable' };
	}

	if (upstream.status >= 500) return { status: 'unavailable' };
	// GoTrue answers a disabled instance with 4xx (403/422). The register handler
	// pre-validates format + password length and uses a random address, so a 4xx
	// here means signups are closed rather than a bad request.
	if (upstream.status !== 200 && upstream.status !== 201) return { status: 'disabled' };

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

	const user = json.user as { id?: unknown } | undefined;
	if (
		typeof json.access_token !== 'string' ||
		typeof json.refresh_token !== 'string' ||
		typeof user?.id !== 'string'
	) {
		return { status: 'unavailable' };
	}

	return {
		status: 'ok',
		userId: user.id,
		accessToken: json.access_token,
		refreshToken: json.refresh_token,
		expiresIn: typeof json.expires_in === 'number' ? json.expires_in : undefined
	};
}

export type LogoutScope = 'local' | 'global';

// Revoke server-side. GoTrue's /logout needs a bearer, so mint a fresh access
// token from the durable refresh token first — the access cookie's JWT may
// already be expired, and minting guarantees a usable bearer (the rotation it
// triggers is harmless, we revoke the session next). `scope=local` revokes this
// session; `scope=global` revokes all the user's sessions. Errors are swallowed:
// the caller clears cookies regardless (explicit user intent wins), and the
// token is never logged (docs/logging.md).
export async function logout(refreshToken: string, scope: LogoutScope): Promise<void> {
	const minted = await refresh(refreshToken);
	if (minted.status !== 'ok') return;
	try {
		await fetch(`${gotrueUrl()}/logout?scope=${scope}`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${minted.accessToken}` }
		});
	} catch {
		// Swallow — the handler clears cookies regardless.
	}
}
