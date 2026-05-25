import { onUnauthorized } from '$lib/shared/state/session.svelte';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

export class AuthError extends Error {
	constructor(message = 'Unauthorized') {
		super(message);
		this.name = 'AuthError';
	}
}

// PostgREST returns errors as `{ code, message, details, hint }` — all four
// fields surface so callers can branch on `code` (the canonical handle) and
// still display `hint`/`details` when useful.
export class ApiError extends Error {
	code?: string;
	details?: string;
	hint?: string;

	constructor(message: string, parts: { code?: string; details?: string; hint?: string } = {}) {
		super(message);
		this.name = 'ApiError';
		this.code = parts.code;
		this.details = parts.details;
		this.hint = parts.hint;
	}
}

async function request<T>(
	method: string,
	path: string,
	body?: unknown,
	init?: RequestInit
): Promise<T> {
	const headers = new Headers(init?.headers);
	if (!headers.has('Accept')) headers.set('Accept', 'application/json');
	if (body !== undefined && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}

	const res = await fetch(`${API_BASE}${path}`, {
		...init,
		method,
		headers,
		credentials: 'same-origin',
		body: body === undefined ? init?.body : JSON.stringify(body)
	});

	if (res.status === 401) {
		onUnauthorized();
		throw new AuthError();
	}

	if (!res.ok) {
		const contentType = res.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			// PostgREST returns either a single `{code,message,...}` object or an
			// array `[{code,message,...}]` for constraint-violation errors from RPCs.
			// Normalise to the first element so callers can always check `err.code`.
			const raw = (await res.json()) as unknown;
			const payload = (Array.isArray(raw) ? raw[0] : raw) as
				| {
						code?: string;
						message?: string;
						details?: string;
						hint?: string;
				  }
				| undefined;
			throw new ApiError(payload?.message ?? res.statusText, {
				code: payload?.code,
				details: payload?.details,
				hint: payload?.hint
			});
		}
		throw new ApiError(res.statusText);
	}

	if (res.status === 204) return undefined as T;
	const contentType = res.headers.get('content-type') ?? '';
	// +json covers structured-syntax variants like application/vnd.pgrst.object+json
	const isJson = contentType.includes('application/json') || contentType.includes('+json');
	if (!isJson) return undefined as T;
	return (await res.json()) as T;
}

export function pgGet<T>(path: string, init?: RequestInit): Promise<T> {
	return request<T>('GET', path, undefined, init);
}

export function pgPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
	return request<T>('POST', path, body, init);
}

export function pgPatch<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
	return request<T>('PATCH', path, body, init);
}

export function pgDelete(path: string, init?: RequestInit): Promise<void> {
	return request<void>('DELETE', path, undefined, init);
}
