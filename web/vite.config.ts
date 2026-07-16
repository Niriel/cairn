import { createHash, createHmac, randomInt, randomUUID } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
	CSRF_HEADER,
	LOGOUT_PATHS,
	PUBLIC_AUTH_PATHS,
	isSegmentMatch
} from './src/lib/shared/model/auth-paths';

// Module augmentation: every read site for the stamped original URL
// goes through `req.cairnOriginalUrl` with full type safety, so a typo
// can't silently fall through to the rewritten `req.url`. See
// auth-paths.ts and Task 1.4 Decisions.
declare module 'node:http' {
	interface IncomingMessage {
		cairnOriginalUrl?: string;
	}
}

// Dev-only cookie shim. In production Caddy translates between the
// HttpOnly cookies and the `Authorization: Bearer …` header that
// PostgREST expects; locally Vite's dev proxy plays the same role so
// the SvelteKit app sees identical paths and cookie behaviour in both
// environments. See docs/development.md.
//
// Two cookies (mirrors Caddyfile.prod): the durable `cairn_session`
// holds the rotating refresh token (the session lifetime / sign-out
// target), and the short-lived `cairn_access` holds the BFF-minted
// access JWT that the data plane attaches as a bearer. The data plane
// (`/api`, `/avatars`) reads the access cookie; the durable cookie is
// what the auth plane refreshes against.
const COOKIE_NAME = 'cairn_session';
const ACCESS_COOKIE_NAME = 'cairn_access';

// PostgREST base for the dev BFF handlers. In prod the auth-proxy reads
// POSTGREST_URL (http://postgrest:3000); in dev the `/api` proxy already
// targets PostgREST here, so the credential handlers (sign-in/register,
// Tasks 3.2/3.3) reuse the same base to resolve usernames via the
// resolve_username RPC. Mirrors postgrestUrl() in auth-proxy/src/lib/profiles.ts.
const POSTGREST_DEV_URL = 'http://localhost:3000';

// ~30-day idle horizon for both cookies — mirrors IDLE_HORIZON_SECONDS in
// auth-proxy/src/lib/cookies.ts (the prod sibling). The access cookie outlives
// its own JWT deliberately; see that file for why.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function readBearerFromCookie(req: IncomingMessage, name: string): string | null {
	const cookie = req.headers.cookie ?? '';
	const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
	return m ? decodeURIComponent(m[1]) : null;
}

// Dev Set-Cookie strings (no Secure — localhost is plain HTTP). Mirror
// plantSession/clearSession in auth-proxy/src/lib/cookies.ts.
function sessionCookie(name: string, value: string): string {
	return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

function clearCookie(name: string): string {
	return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// Dev mirror of auth-proxy/src/lib/csrf.ts: state-changing Cairn-shaped /auth/*
// requests must carry the custom CSRF header so dev and prod behave identically.
// Node lowercases header names.
function hasCsrfHeader(req: IncomingMessage): boolean {
	return req.headers[CSRF_HEADER.toLowerCase()] !== undefined;
}

// Dev mirror of enrichUser() in auth-proxy/src/index.ts: turn a bare GoTrue user
// into the client-facing `{ id, username }` (or `{ id }` when the profile lookup
// is empty or errors), looked up by uid with the freshly planted access token.
async function enrichDevUser(user: unknown, accessToken: string): Promise<unknown> {
	const id = (user as { id?: unknown } | null | undefined)?.id;
	if (typeof id !== 'string') return user;
	try {
		const r = await fetch(
			`${POSTGREST_DEV_URL}/profiles?id=eq.${encodeURIComponent(id)}&select=username`,
			{ headers: { Authorization: `Bearer ${accessToken}` } }
		);
		if (r.ok) {
			const rows = (await r.json()) as Array<{ username?: unknown }>;
			const row = Array.isArray(rows) ? rows[0] : undefined;
			if (row && typeof row.username === 'string') return { id, username: row.username };
		}
	} catch {
		// Fall through to the bare { id } — never sign a live session out on a blip.
	}
	return { id };
}

async function handleDevRefresh(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const refreshToken = readBearerFromCookie(req, COOKIE_NAME);
	if (!refreshToken) {
		res.setHeader('Set-Cookie', [clearCookie(COOKIE_NAME), clearCookie(ACCESS_COOKIE_NAME)]);
		res.statusCode = 401;
		res.end(JSON.stringify({ error: 'no session' }));
		return;
	}

	let upstream: Response;
	try {
		upstream = await fetch('http://localhost:9999/token?grant_type=refresh_token', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ refresh_token: refreshToken })
		});
	} catch {
		// Transient — leave both cookies intact.
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}

	if (upstream.status >= 500) {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}
	if (upstream.status !== 200) {
		// Authoritative revoke — clear both cookies.
		res.setHeader('Set-Cookie', [clearCookie(COOKIE_NAME), clearCookie(ACCESS_COOKIE_NAME)]);
		res.statusCode = 401;
		res.end(JSON.stringify({ error: 'session revoked' }));
		return;
	}

	const json = (await upstream.json()) as {
		access_token?: string;
		refresh_token?: string;
		user?: unknown;
	};
	if (typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string') {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}

	res.setHeader('Set-Cookie', [
		sessionCookie(COOKIE_NAME, json.refresh_token),
		sessionCookie(ACCESS_COOKIE_NAME, json.access_token)
	]);
	res.setHeader('content-type', 'application/json');
	res.statusCode = 200;
	res.end(JSON.stringify({ user: await enrichDevUser(json.user, json.access_token) }));
}

async function handleDevSignout(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const refreshToken = readBearerFromCookie(req, COOKIE_NAME);
	const scope =
		req.url && new URLSearchParams(req.url.split('?')[1] ?? '').get('scope') === 'global'
			? 'global'
			: 'local';
	if (refreshToken) {
		try {
			// Mint a fresh access token, then revoke server-side (mirrors
			// logout() in auth-proxy/src/lib/session.ts). Errors swallowed —
			// cookies are cleared regardless.
			const minted = await fetch('http://localhost:9999/token?grant_type=refresh_token', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ refresh_token: refreshToken })
			});
			if (minted.status === 200) {
				const json = (await minted.json()) as { access_token?: string };
				if (typeof json.access_token === 'string') {
					await fetch(`http://localhost:9999/logout?scope=${scope}`, {
						method: 'POST',
						headers: { Authorization: `Bearer ${json.access_token}` }
					});
				}
			}
		} catch {
			// Swallow — clear cookies regardless (explicit user intent wins).
		}
	}
	res.setHeader('Set-Cookie', [clearCookie(COOKIE_NAME), clearCookie(ACCESS_COOKIE_NAME)]);
	res.statusCode = 204;
	res.end();
}

function readRequestBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
	});
}

// Dev mirror of the prod POST /auth/signin handler (auth-proxy/src/index.ts):
// resolve the typed username → uid against PostgREST (anon), then run the GoTrue
// password grant against the stable `<uid>@cairn.internal` identity; on success
// plant both cookies and return a tokenless `{ user: { id, username } }`. Unknown
// username and wrong password both answer a constant-shape 401. The prod per-IP /
// per-account rate-limiter is BFF-only — a deliberate dev-parity exception.
async function handleDevSignin(req: IncomingMessage, res: ServerResponse): Promise<void> {
	let creds: { username?: unknown; password?: unknown };
	try {
		creds = JSON.parse(await readRequestBody(req)) as typeof creds;
	} catch {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}
	const username = typeof creds.username === 'string' ? creds.username : '';
	const password = typeof creds.password === 'string' ? creds.password : '';
	if (!username || !password) {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}

	// Resolve the username → uid (anon; resolve_username RPC). The `/api` proxy
	// rewrites away, so call PostgREST directly at its dev base.
	let resolved: { id: string; username: string } | null = null;
	try {
		const r = await fetch(`${POSTGREST_DEV_URL}/rpc/resolve_username`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ p_username: username })
		});
		if (r.ok) {
			const rows = (await r.json()) as Array<{ id?: unknown; username?: unknown }>;
			const row = Array.isArray(rows) ? rows[0] : undefined;
			if (row && typeof row.id === 'string' && typeof row.username === 'string') {
				resolved = { id: row.id, username: row.username };
			}
		}
	} catch {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}
	if (!resolved) {
		res.statusCode = 401;
		res.end(JSON.stringify({ error: 'invalid credentials' }));
		return;
	}

	let grant: Response;
	try {
		grant = await fetch('http://localhost:9999/token?grant_type=password', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: `${resolved.id}@cairn.internal`, password })
		});
	} catch {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}
	if (grant.status >= 500) {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}
	if (grant.status !== 200) {
		res.statusCode = 401;
		res.end(JSON.stringify({ error: 'invalid credentials' }));
		return;
	}
	const json = (await grant.json()) as { access_token?: string; refresh_token?: string };
	if (typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string') {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}

	res.setHeader('Set-Cookie', [
		sessionCookie(COOKIE_NAME, json.refresh_token),
		sessionCookie(ACCESS_COOKIE_NAME, json.access_token)
	]);
	res.setHeader('content-type', 'application/json');
	res.statusCode = 200;
	res.end(JSON.stringify({ user: { id: resolved.id, username: resolved.username } }));
}

// Dev mirror of the prod POST /auth/register handler (auth-proxy/src/index.ts):
// validate → availability pre-check → GoTrue signup with a transient
// `<random>@cairn.internal` address → adopt the stable identity → set the chosen
// username → plant the session → tokenless `{ user }`. The prod per-IP throttle
// is BFF-only and omitted in dev (covered by the auth-proxy unit test).
async function handleDevRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
	let creds: { username?: unknown; password?: unknown };
	try {
		creds = JSON.parse(await readRequestBody(req)) as typeof creds;
	} catch {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}
	const username = typeof creds.username === 'string' ? creds.username : '';
	const password = typeof creds.password === 'string' ? creds.password : '';
	if (!/^[A-Za-z0-9]{3,30}$/.test(username)) {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid username' }));
		return;
	}
	if (password.length < 8) {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'password too short' }));
		return;
	}

	// Availability pre-check (anon resolve_username RPC).
	try {
		const r = await fetch(`${POSTGREST_DEV_URL}/rpc/resolve_username`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ p_username: username })
		});
		const rows = r.ok ? ((await r.json()) as unknown[]) : [];
		if (Array.isArray(rows) && rows.length > 0) {
			res.statusCode = 409;
			res.end(JSON.stringify({ error: 'username taken' }));
			return;
		}
	} catch {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}

	// Create the GoTrue account with a transient random address.
	let signup: Response;
	try {
		signup = await fetch('http://localhost:9999/signup', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: `${randomUUID()}@cairn.internal`, password })
		});
	} catch {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}
	if (signup.status !== 200 && signup.status !== 201) {
		// 4xx → signups disabled (operator switch); 5xx → transient.
		res.statusCode = signup.status >= 500 ? 503 : 403;
		res.end(
			JSON.stringify({
				error: signup.status >= 500 ? 'upstream auth service unavailable' : 'registration closed'
			})
		);
		return;
	}
	const created = (await signup.json()) as {
		access_token?: string;
		refresh_token?: string;
		user?: { id?: string };
	};
	if (
		typeof created.access_token !== 'string' ||
		typeof created.refresh_token !== 'string' ||
		typeof created.user?.id !== 'string'
	) {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}
	const bearer = {
		'content-type': 'application/json',
		Authorization: `Bearer ${created.access_token}`
	};

	// Adopt the stable identity, then set the chosen username — both as the new
	// account's bearer. Any failure leaves a sessionless orphan; never plant.
	const adopt = await fetch(`${POSTGREST_DEV_URL}/rpc/adopt_stable_identity`, {
		method: 'POST',
		headers: bearer,
		body: '{}'
	});
	if (!adopt.ok) {
		res.statusCode = 500;
		res.end(JSON.stringify({ error: 'registration failed' }));
		return;
	}
	const named = await fetch(`${POSTGREST_DEV_URL}/rpc/set_username`, {
		method: 'POST',
		headers: bearer,
		body: JSON.stringify({ p_username: username })
	});
	if (!named.ok) {
		const code = (await named.json().catch(() => ({}) as { code?: string })).code;
		res.statusCode = code === '23505' ? 409 : 500;
		res.end(JSON.stringify({ error: code === '23505' ? 'username taken' : 'registration failed' }));
		return;
	}

	res.setHeader('Set-Cookie', [
		sessionCookie(COOKIE_NAME, created.refresh_token),
		sessionCookie(ACCESS_COOKIE_NAME, created.access_token)
	]);
	res.setHeader('content-type', 'application/json');
	res.statusCode = 200;
	res.end(JSON.stringify({ user: { id: created.user.id, username } }));
}

// Dev-only minimal SMTP send to Mailpit (localhost:1025, no auth/TLS). The prod
// BFF sends via nodemailer (auth-proxy/src/lib/mail.ts); a tiny dependency-free
// dialogue is enough here since Mailpit accepts plain unauthenticated SMTP, and
// it keeps the web package free of a mail dependency. Takes the subject + body so
// both the verify (verifyEmailMessage) and reset (resetPasswordMessage) copy can
// be sent. Resolves once the message is accepted.
function sendDevMail(to: string, subject: string, text: string): Promise<void> {
	const from = 'no-reply@cairn.local';
	const message =
		`From: Cairn <${from}>\r\n` + `To: <${to}>\r\n` + `Subject: ${subject}\r\n` + '\r\n' + text;
	// One command per server response; HELO (not EHLO) so each step gets a single
	// reply line. The body's leading dots are stuffed and a lone "." terminates DATA.
	const steps = [
		'HELO localhost',
		`MAIL FROM:<${from}>`,
		`RCPT TO:<${to}>`,
		'DATA',
		`${message.replace(/\r\n\./g, '\r\n..')}\r\n.`,
		'QUIT'
	];
	return new Promise((resolve, reject) => {
		const socket = net.createConnection({ host: 'localhost', port: 1025 });
		socket.setEncoding('utf8');
		let i = 0;
		socket.on('data', () => {
			if (i < steps.length) {
				socket.write(`${steps[i++]}\r\n`);
			} else {
				socket.end();
				resolve();
			}
		});
		socket.on('error', reject);
		socket.on('end', resolve);
	});
}

// Dev copies of the two mail bodies (mirrors verifyEmailMessage /
// resetPasswordMessage in auth-proxy/src/lib/mail.ts — the web package can't import
// across the package boundary, so the copy is duplicated like the other dev
// mirrors). `\r\n` line endings for the SMTP dialogue.
function verifyMailBody(code: string): { subject: string; text: string } {
	return {
		subject: 'Confirm your recovery e-mail',
		text:
			'Someone asked to add this address as a recovery e-mail for a Cairn account.\r\n\r\n' +
			`Your confirmation code is: ${code}\r\n\r\n` +
			'Enter it in Cairn to confirm this address. The code expires in one hour.\r\n\r\n' +
			"If you didn't ask for this, you can safely ignore this e-mail.\r\n"
	};
}

function resetMailBody(code: string): { subject: string; text: string } {
	return {
		subject: 'Reset your Cairn password',
		text:
			'Someone asked to reset the password for a Cairn account linked to this address.\r\n\r\n' +
			`Your reset code is: ${code}\r\n\r\n` +
			'Enter it in Cairn to set a new password. The code expires in one hour.\r\n\r\n' +
			"If you didn't ask for this, you can safely ignore this e-mail; your password will not change.\r\n"
	};
}

// The dev scoped-role JWT for the signed-out reset RPCs (request_password_reset /
// reset_password), which are granted only to cairn_auth_bff — anon cannot reach
// them. Mirrors bffJwt() in auth-proxy/src/lib/recovery.ts. Set on process.env at
// config load (from an explicit AUTH_BFF_DB_JWT or minted from the dev JWT_SECRET).
function bffJwt(): string {
	return process.env.AUTH_BFF_DB_JWT ?? '';
}

// Mint an HS256 cairn_auth_bff role JWT from the dev JWT_SECRET (the same algorithm
// as scripts/mint-bff-jwt.sh). Dev-only convenience so the recovery path works out
// of the box without committing a token to .env.example; in prod the auth-proxy
// always receives a pre-minted, independently-rotatable AUTH_BFF_DB_JWT instead.
function mintBffJwt(secret: string): string {
	const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url');
	const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60; // ~10 years
	const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'cairn_auth_bff', exp })}`;
	const sig = createHmac('sha256', secret).update(data).digest('base64url');
	return `${data}.${sig}`;
}

// Dev mirror of the prod POST /auth/recovery-email handler (auth-proxy/src/index.ts):
// the authenticated set/remove path, run under the caller's own access bearer.
// {remove:true} clears the on-file address (clear_recovery_email, no code/mail);
// otherwise generate a 6-digit code, record a verify token (passing only its hash),
// and mail the plaintext to the candidate address.
async function handleDevRecoveryEmail(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const token = readBearerFromCookie(req, ACCESS_COOKIE_NAME);
	if (!token) {
		res.statusCode = 401;
		res.end(JSON.stringify({ error: 'no session' }));
		return;
	}
	const bearer = { 'content-type': 'application/json', Authorization: `Bearer ${token}` };

	let body: { email?: unknown; remove?: unknown };
	try {
		body = JSON.parse(await readRequestBody(req)) as typeof body;
	} catch {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}

	if (body.remove === true) {
		const r = await fetch(`${POSTGREST_DEV_URL}/rpc/clear_recovery_email`, {
			method: 'POST',
			headers: bearer,
			body: '{}'
		});
		res.statusCode = r.ok ? 200 : 502;
		res.end(JSON.stringify(r.ok ? { ok: true } : { error: 'upstream auth service unavailable' }));
		return;
	}

	const email = typeof body.email === 'string' ? body.email : '';
	if (!email) {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}

	const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
	const codeHash = createHash('sha256').update(code, 'utf8').digest('hex');
	const r = await fetch(`${POSTGREST_DEV_URL}/rpc/request_recovery_email_verification`, {
		method: 'POST',
		headers: bearer,
		body: JSON.stringify({ p_email: email, p_code_hash: codeHash })
	});
	if (!r.ok) {
		const errCode = (await r.json().catch(() => ({}) as { code?: string })).code;
		if (errCode === 'CA429') {
			res.statusCode = 429;
			res.end(JSON.stringify({ error: 'too many requests' }));
		} else if (errCode === '23514') {
			res.statusCode = 400;
			res.end(JSON.stringify({ error: 'invalid e-mail' }));
		} else {
			res.statusCode = 502;
			res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		}
		return;
	}
	try {
		const { subject, text } = verifyMailBody(code);
		await sendDevMail(email, subject, text);
	} catch {
		res.statusCode = 502;
		res.end(JSON.stringify({ error: 'could not send recovery e-mail' }));
		return;
	}
	res.statusCode = 200;
	res.end(JSON.stringify({ ok: true }));
}

// Dev mirror of the prod POST /auth/recovery-email/confirm handler: hash the code
// and redeem it via confirm_recovery_email (which RETURNS a status string), then
// map 'ok'/'invalid'/'locked' to 200/400/429.
async function handleDevRecoveryConfirm(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const token = readBearerFromCookie(req, ACCESS_COOKIE_NAME);
	if (!token) {
		res.statusCode = 401;
		res.end(JSON.stringify({ error: 'no session' }));
		return;
	}
	let body: { code?: unknown };
	try {
		body = JSON.parse(await readRequestBody(req)) as typeof body;
	} catch {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}
	const code = typeof body.code === 'string' ? body.code : '';
	if (!code) {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}
	const codeHash = createHash('sha256').update(code, 'utf8').digest('hex');
	const r = await fetch(`${POSTGREST_DEV_URL}/rpc/confirm_recovery_email`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ p_code_hash: codeHash })
	});
	if (!r.ok) {
		res.statusCode = 502;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}
	const status = (await r.json().catch(() => null)) as unknown;
	if (status === 'ok') {
		res.statusCode = 200;
		res.end(JSON.stringify({ ok: true }));
	} else if (status === 'invalid') {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'incorrect or expired code' }));
	} else if (status === 'locked') {
		res.statusCode = 429;
		res.end(JSON.stringify({ error: 'too many attempts' }));
	} else {
		res.statusCode = 502;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
	}
}

// Dev mirror of the prod POST /auth/forgot-password handler (auth-proxy/src/index.ts):
// signed-out reset request by username. Anti-enumeration is timing parity — emit the
// constant 200 FIRST, then run the scoped lookup-and-send entirely after responding
// (fire-and-forget) so an account with a recovery e-mail isn't measurably slower. The
// reset RPCs are granted only to cairn_auth_bff, so the dev handler attaches the dev
// scoped-role JWT. The prod per-IP throttle is BFF-only (dev-parity exception).
async function handleDevForgotPassword(req: IncomingMessage, res: ServerResponse): Promise<void> {
	let body: { username?: unknown };
	try {
		body = JSON.parse(await readRequestBody(req)) as typeof body;
	} catch {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}
	const username = typeof body.username === 'string' ? body.username : '';
	if (!username) {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}

	const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
	const codeHash = createHash('sha256').update(code, 'utf8').digest('hex');

	// Respond before the lookup/send — neither sits on the response's critical path.
	res.statusCode = 200;
	res.end(JSON.stringify({ ok: true }));

	void (async () => {
		try {
			const r = await fetch(`${POSTGREST_DEV_URL}/rpc/request_password_reset`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', Authorization: `Bearer ${bffJwt()}` },
				body: JSON.stringify({ p_username: username, p_code_hash: codeHash })
			});
			if (!r.ok) return;
			const email = (await r.json().catch(() => null)) as unknown;
			if (typeof email === 'string') {
				const { subject, text } = resetMailBody(code);
				await sendDevMail(email, subject, text);
			}
		} catch {
			// Swallow — the caller already got the constant 200.
		}
	})();
}

// Dev mirror of the prod POST /auth/reset-password handler (auth-proxy/src/index.ts):
// set a new password from a code (no session). Pre-checks the minimum length, then
// calls reset_password via the scoped role; maps 'ok'→200, collapses 'invalid'/'locked'
// to one generic error, and maps a raised 23514 to the minimum-length error. No cookie
// is planted (the user signs in afterwards).
async function handleDevResetPassword(req: IncomingMessage, res: ServerResponse): Promise<void> {
	let body: { username?: unknown; code?: unknown; new_password?: unknown };
	try {
		body = JSON.parse(await readRequestBody(req)) as typeof body;
	} catch {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}
	const username = typeof body.username === 'string' ? body.username : '';
	const code = typeof body.code === 'string' ? body.code : '';
	const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
	if (!username || !code || !newPassword) {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}
	if (newPassword.length < 8) {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'password too short' }));
		return;
	}

	const codeHash = createHash('sha256').update(code, 'utf8').digest('hex');
	const r = await fetch(`${POSTGREST_DEV_URL}/rpc/reset_password`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', Authorization: `Bearer ${bffJwt()}` },
		body: JSON.stringify({
			p_username: username,
			p_code_hash: codeHash,
			p_new_password: newPassword
		})
	});
	if (!r.ok) {
		const errCode = (await r.json().catch(() => ({}) as { code?: string })).code;
		if (errCode === '23514') {
			res.statusCode = 400;
			res.end(JSON.stringify({ error: 'password too short' }));
		} else {
			res.statusCode = 502;
			res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		}
		return;
	}
	const status = (await r.json().catch(() => null)) as unknown;
	if (status === 'ok') {
		res.statusCode = 200;
		res.end(JSON.stringify({ ok: true }));
	} else {
		// Collapse 'invalid' and 'locked' to one generic error (R5/R8).
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid or expired code' }));
	}
}

export default defineConfig(({ mode }) => {
	// Load the repo-root .env (the same dev-secrets file docker compose reads —
	// one level up from this web/ root) and surface the cairn_auth_bff role JWT on
	// process.env. The dev recovery handlers (handleDevForgotPassword /
	// handleDevResetPassword) present it as the bearer for the signed-out reset RPCs,
	// which are granted only to that role. Prefer an explicitly provided
	// AUTH_BFF_DB_JWT (env parity with prod); otherwise mint one from the dev
	// JWT_SECRET so dev works out of the box WITHOUT a token committed to
	// .env.example. Not VITE_-prefixed, so neither value reaches the client bundle.
	const rootEnv = loadEnv(mode, path.resolve(process.cwd(), '..'), '');
	const bff =
		process.env.AUTH_BFF_DB_JWT ??
		rootEnv.AUTH_BFF_DB_JWT ??
		(rootEnv.JWT_SECRET ? mintBffJwt(rootEnv.JWT_SECRET) : undefined);
	if (bff) process.env.AUTH_BFF_DB_JWT = bff;

	return {
		plugins: [
			{
				// Stamps the original `/auth/...` URL onto the request before
				// Vite's internal proxy rewrites it. The `proxyReq` and `proxyRes`
				// handlers below need the original path to match against the
				// path lists in auth-paths.ts (which are all `/auth/...`-shaped).
				name: 'cairn-auth-shim',
				enforce: 'pre',
				configureServer(server) {
					// no return from configureServer → installs before Vite's internal
					// proxy; see auth-paths.ts and Task 1.4 Decisions.
					server.middlewares.use((req, _res, next) => {
						if (req.url?.startsWith('/auth/') || req.url === '/auth') {
							req.cairnOriginalUrl = req.url;
						}
						next();
					});
					// Sign-out: dev mirror of the prod POST /auth/signout handler
					// (auth-proxy/src/index.ts) — revoke server-side at GoTrue, then
					// clear both cookies (cleared regardless of the revoke outcome).
					// Mounted at root (no path arg) so `req.url` stays the full request
					// path — `server.middlewares.use('/auth/signout', …)` would strip
					// the mount and leave `req.url === '/'`, silently failing the
					// segment match.
					server.middlewares.use((req, res, next) => {
						if (!isSegmentMatch(req.url, LOGOUT_PATHS) || req.method !== 'POST') {
							next();
							return;
						}
						if (!hasCsrfHeader(req)) {
							res.statusCode = 403;
							res.end(JSON.stringify({ error: 'missing csrf header' }));
							return;
						}
						void handleDevSignout(req, res);
					});
					// Bespoke dev mirror of the prod /auth/refresh handler
					// (auth-proxy/src/index.ts): exchange the durable refresh cookie
					// at GoTrue, re-plant both cookies, return a tokenless user.
					// GoTrue has no /refresh route, so this can't be a plain proxy.
					// Distinguishes an authoritative revoke (clear + 401) from a
					// transient blip (503, cookies intact).
					server.middlewares.use((req, res, next) => {
						if (req.url?.split('?')[0] !== '/auth/refresh' || req.method !== 'POST') {
							next();
							return;
						}
						if (!hasCsrfHeader(req)) {
							res.statusCode = 403;
							res.end(JSON.stringify({ error: 'missing csrf header' }));
							return;
						}
						void handleDevRefresh(req, res);
					});
					// Cairn-shaped credential endpoints — dev mirror of the prod
					// /auth/signin + /auth/register handlers (auth-proxy/src/index.ts),
					// both now the real username+password flows. They sit behind the CSRF
					// gate so dev exercises the same routes + guard as prod. GoTrue:9999
					// has no such routes, so these can't be a plain proxy. (The prod
					// rate-limiter is BFF-only — a dev-parity exception.)
					server.middlewares.use((req, res, next) => {
						const path = req.url?.split('?')[0];
						if ((path !== '/auth/signin' && path !== '/auth/register') || req.method !== 'POST') {
							next();
							return;
						}
						if (!hasCsrfHeader(req)) {
							res.statusCode = 403;
							res.end(JSON.stringify({ error: 'missing csrf header' }));
							return;
						}
						if (path === '/auth/signin') {
							void handleDevSignin(req, res);
							return;
						}
						void handleDevRegister(req, res);
					});
					// Recovery-e-mail set/confirm/remove — dev mirror of the prod
					// /auth/recovery-email + /auth/recovery-email/confirm handlers
					// (auth-proxy/src/index.ts). Matched by EXACT path (confirm first):
					// the confirm path is a sub-path of the set path, so a prefix match
					// would swallow it. Behind the CSRF gate for dev/prod parity.
					server.middlewares.use((req, res, next) => {
						const path = req.url?.split('?')[0];
						if (
							(path !== '/auth/recovery-email' && path !== '/auth/recovery-email/confirm') ||
							req.method !== 'POST'
						) {
							next();
							return;
						}
						if (!hasCsrfHeader(req)) {
							res.statusCode = 403;
							res.end(JSON.stringify({ error: 'missing csrf header' }));
							return;
						}
						if (path === '/auth/recovery-email/confirm') {
							void handleDevRecoveryConfirm(req, res);
							return;
						}
						void handleDevRecoveryEmail(req, res);
					});
					// Signed-out recovery — dev mirror of the prod /auth/forgot-password +
					// /auth/reset-password handlers (auth-proxy/src/index.ts). Behind the CSRF
					// gate for dev/prod parity; both reach the scoped reset RPCs.
					server.middlewares.use((req, res, next) => {
						const path = req.url?.split('?')[0];
						if (
							(path !== '/auth/forgot-password' && path !== '/auth/reset-password') ||
							req.method !== 'POST'
						) {
							next();
							return;
						}
						if (!hasCsrfHeader(req)) {
							res.statusCode = 403;
							res.end(JSON.stringify({ error: 'missing csrf header' }));
							return;
						}
						if (path === '/auth/forgot-password') {
							void handleDevForgotPassword(req, res);
							return;
						}
						void handleDevResetPassword(req, res);
					});
					// Password-grant lockdown (dev parity): the public GoTrue password
					// grant must be unreachable; the only password-grant path is
					// /auth/signin above. The lockdown is surgical — reject only
					// grant_type=password (read from the query string), forward any other.
					server.middlewares.use((req, res, next) => {
						if (req.url?.split('?')[0] !== '/auth/token' || req.method !== 'POST') {
							next();
							return;
						}
						const grantType = new URLSearchParams(req.url.split('?')[1] ?? '').get('grant_type');
						if (grantType === 'password') {
							res.statusCode = 403;
							res.end(JSON.stringify({ error: 'use /auth/signin' }));
							return;
						}
						next();
					});
				}
			},
			sveltekit()
		],
		server: {
			proxy: {
				'/api': {
					target: POSTGREST_DEV_URL,
					changeOrigin: false,
					rewrite: (p) => p.replace(/^\/api/, ''),
					configure: (proxy) => {
						proxy.on('proxyReq', (proxyReq, req) => {
							const token = readBearerFromCookie(req, ACCESS_COOKIE_NAME);
							if (token && !proxyReq.getHeader('authorization')) {
								proxyReq.setHeader('Authorization', `Bearer ${token}`);
							}
						});
					}
				},
				'/avatars': {
					target: 'http://localhost:8080',
					changeOrigin: false,
					configure: (proxy) => {
						proxy.on('proxyReq', (proxyReq, req) => {
							const token = readBearerFromCookie(req, ACCESS_COOKIE_NAME);
							if (token && !proxyReq.getHeader('authorization')) {
								proxyReq.setHeader('Authorization', `Bearer ${token}`);
							}
						});
					}
				},
				'/auth': {
					target: 'http://localhost:9999',
					changeOrigin: false,
					rewrite: (p) => p.replace(/^\/auth/, ''),
					// `bypass` runs before `rewrite`, so `req.url` is still the
					// original `/auth/...` here. Returning a string short-circuits
					// the proxy entirely and lets SvelteKit's router serve the
					// page (e.g. `/auth/reset-password?code=…`); see auth-paths.ts.
					bypass: (req) => (isSegmentMatch(req.url, PUBLIC_AUTH_PATHS) ? req.url : undefined),
					selfHandleResponse: true,
					configure: (proxy) => {
						// This pass-through serves only anonymous GoTrue endpoints, so it
						// attaches no cookie-derived bearer (bearer-attach retired).
						proxy.on('proxyRes', (proxyRes, req: IncomingMessage, res: ServerResponse) => {
							const chunks: Buffer[] = [];
							proxyRes.on('data', (c: Buffer) => chunks.push(c));
							proxyRes.on('end', () => {
								let body = Buffer.concat(chunks);
								for (const [k, v] of Object.entries(proxyRes.headers)) {
									if (v === undefined) continue;
									// Skip content-length so Node recomputes it from the
									// (possibly rewritten) body in `res.end(body)`.
									if (k.toLowerCase() === 'content-length') continue;
									res.setHeader(k, v as string | string[]);
								}
								res.statusCode = proxyRes.statusCode ?? 502;
								const ct = String(proxyRes.headers['content-type'] ?? '');
								if (ct.includes('application/json') && proxyRes.statusCode === 200) {
									try {
										const json = JSON.parse(body.toString('utf8'));
										// Strip any token from a forwarded body — JS has no use
										// for one, the cookie is the source of truth, and this
										// pass-through plants no session cookie (dev parity with
										// the prod auth-proxy).
										if (
											typeof json?.access_token === 'string' ||
											typeof json?.refresh_token === 'string'
										) {
											delete json.access_token;
											delete json.refresh_token;
											body = Buffer.from(JSON.stringify(json));
										}
									} catch {
										// non-JSON or parse error — pass through unchanged.
									}
								}
								res.end(body);
							});
						});
					}
				}
			}
		}
	};
});
