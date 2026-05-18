import type { AuthUser } from '$lib/shared/state/session.svelte';

const AUTH_BASE = import.meta.env.VITE_AUTH_BASE ?? '/auth';

async function postJson<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(`${AUTH_BASE}${path}`, {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const message = await readErrorMessage(res);
		throw new Error(message);
	}
	const contentType = res.headers.get('content-type') ?? '';
	if (!contentType.includes('application/json')) {
		return undefined as T;
	}
	return (await res.json()) as T;
}

async function readErrorMessage(res: Response): Promise<string> {
	const contentType = res.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		try {
			const payload = (await res.json()) as { msg?: string; error_description?: string };
			return payload.msg ?? payload.error_description ?? res.statusText;
		} catch {
			return res.statusText;
		}
	}
	return res.statusText;
}

// The `user` object in a 2xx body might be missing if a future GoTrue
// version drifts. Guarding here keeps the TS return type honest — without
// it, callers like `setSignedIn(result.user)` would silently receive
// `undefined`.
function assertAuthUser(value: unknown): asserts value is AuthUser {
	if (
		value === null ||
		typeof value !== 'object' ||
		typeof (value as { id?: unknown }).id !== 'string' ||
		typeof (value as { email?: unknown }).email !== 'string'
	) {
		throw new Error('Malformed auth response: missing user.id or user.email');
	}
}

export async function sendMagicLink(email: string): Promise<void> {
	await postJson<unknown>('/otp', { email, create_user: true });
}

export async function verifyToken(args: {
	token: string;
	type: 'magiclink';
}): Promise<{ user: AuthUser }> {
	const payload = await postJson<{ user?: unknown }>('/verify', args);
	assertAuthUser(payload?.user);
	return { user: payload.user };
}

export async function devPasswordSignIn(
	email: string,
	password: string
): Promise<{ user: AuthUser }> {
	const payload = await postJson<{ user?: unknown }>('/token?grant_type=password', {
		email,
		password
	});
	assertAuthUser(payload?.user);
	return { user: payload.user };
}

export async function logout(): Promise<void> {
	const res = await fetch(`${AUTH_BASE}/session`, {
		method: 'DELETE',
		credentials: 'same-origin'
	});
	if (!res.ok) {
		const message = await readErrorMessage(res);
		throw new Error(message);
	}
}
