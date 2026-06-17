import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveUsername, usernameForUid } from '../src/lib/profiles.js';

// Stub PostgREST: resolveUsername POSTs /rpc/resolve_username (as anon, no
// bearer) and usernameForUid GETs /profiles?id=eq.<uid>&select=username (with a
// bearer). Each test sets `respond` to model the matching / empty cases.
let lastReq: {
	method: string;
	url: string;
	body: string;
	auth: string | undefined;
} | null;
let respond: (req: http.IncomingMessage, res: http.ServerResponse) => void;
let postgrest: http.Server;

beforeAll(async () => {
	postgrest = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			lastReq = {
				method: req.method ?? '',
				url: req.url ?? '',
				body: Buffer.concat(chunks).toString('utf8'),
				auth: req.headers.authorization
			};
			respond(req, res);
		});
	});
	await new Promise<void>((resolve) => postgrest.listen(0, '127.0.0.1', resolve));
	const { port } = postgrest.address() as AddressInfo;
	process.env.POSTGREST_URL = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve, reject) =>
		postgrest.close((err) => (err ? reject(err) : resolve()))
	);
});

beforeEach(() => {
	lastReq = null;
});

function json(res: http.ServerResponse, payload: unknown): void {
	res.statusCode = 200;
	res.setHeader('content-type', 'application/json');
	res.end(JSON.stringify(payload));
}

describe('resolveUsername', () => {
	it('(a) POSTs /rpc/resolve_username with {p_username} and returns the row', async () => {
		respond = (_req, res) => json(res, [{ id: 'uid-1', username: 'LaraCroft' }]);
		const row = await resolveUsername('laracroft');
		expect(row).toEqual({ id: 'uid-1', username: 'LaraCroft' });
		expect(lastReq?.method).toBe('POST');
		expect(lastReq?.url).toBe('/rpc/resolve_username');
		expect(JSON.parse(lastReq?.body ?? '{}')).toEqual({ p_username: 'laracroft' });
	});

	it('(b) returns null for an empty result', async () => {
		respond = (_req, res) => json(res, []);
		expect(await resolveUsername('nobody')).toBeNull();
	});

	it('(c) sends no Authorization header (runs as anon)', async () => {
		respond = (_req, res) => json(res, [{ id: 'uid-1', username: 'LaraCroft' }]);
		await resolveUsername('laracroft');
		expect(lastReq?.auth).toBeUndefined();
	});
});

describe('usernameForUid', () => {
	it('(d) GETs /profiles?id=eq.<uid>&select=username with the bearer and returns the username', async () => {
		respond = (_req, res) => json(res, [{ username: 'LaraCroft' }]);
		const name = await usernameForUid('uid-1', 'ACCESS.token');
		expect(name).toBe('LaraCroft');
		expect(lastReq?.method).toBe('GET');
		expect(lastReq?.url).toBe('/profiles?id=eq.uid-1&select=username');
		expect(lastReq?.auth).toBe('Bearer ACCESS.token');
	});

	it('(e) returns null when no profile row is present', async () => {
		respond = (_req, res) => json(res, []);
		expect(await usernameForUid('uid-1', 'ACCESS.token')).toBeNull();
	});
});
