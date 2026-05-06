import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Dev-only cookie shim. In production Caddy translates between the
// HttpOnly `cairn_session` cookie and the `Authorization: Bearer …`
// header that PostgREST expects; locally Vite's dev proxy plays the
// same role so the SvelteKit app sees identical paths and cookie
// behaviour in both environments. See docs/development.md.
const COOKIE_NAME = 'cairn_session';

function readBearerFromCookie(req: IncomingMessage): string | null {
	const cookie = req.headers.cookie ?? '';
	const m = cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
	return m ? decodeURIComponent(m[1]) : null;
}

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:3000',
				changeOrigin: false,
				rewrite: (p) => p.replace(/^\/api/, ''),
				configure: (proxy) => {
					proxy.on('proxyReq', (proxyReq, req) => {
						const token = readBearerFromCookie(req);
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
				selfHandleResponse: true,
				configure: (proxy) => {
					proxy.on('proxyRes', (proxyRes, _req, res: ServerResponse) => {
						const chunks: Buffer[] = [];
						proxyRes.on('data', (c: Buffer) => chunks.push(c));
						proxyRes.on('end', () => {
							const body = Buffer.concat(chunks);
							for (const [k, v] of Object.entries(proxyRes.headers)) {
								if (v !== undefined) res.setHeader(k, v as string | string[]);
							}
							res.statusCode = proxyRes.statusCode ?? 502;
							const ct = String(proxyRes.headers['content-type'] ?? '');
							if (ct.includes('application/json') && proxyRes.statusCode === 200) {
								try {
									const json = JSON.parse(body.toString('utf8'));
									if (typeof json?.access_token === 'string') {
										const cookie =
											`${COOKIE_NAME}=${encodeURIComponent(json.access_token)}; ` +
											`Path=/; HttpOnly; SameSite=Lax; Max-Age=${json.expires_in ?? 3600}`;
										res.setHeader('set-cookie', cookie);
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
});
