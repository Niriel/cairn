# Build stage: produce the static SvelteKit bundle in production mode. NODE_ENV
# is set *after* install so the build toolchain (devDependencies) is still
# available to pnpm.
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
RUN pnpm build

# Runtime stage: Caddy serves the static bundle on :80 with an SPA fallback so
# client-side routes resolve to index.html. adapter-static emits the gotrue
# templates under build/gotrue/ alongside the app, served from the same root.
FROM caddy:2.9.1-alpine AS runtime
COPY --from=build /app/build /srv
RUN printf '%s\n' \
	':80 {' \
	'	root * /srv' \
	'	encode gzip' \
	'	try_files {path} /index.html' \
	'	file_server' \
	'}' \
	> /etc/caddy/Caddyfile
EXPOSE 80
