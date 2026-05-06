import type { RequestHandler } from 'msw';

// PostgREST and GoTrue mock handlers go here.
// Tests can override individual handlers via `server.use(...)`.
// See docs/testing.md → "Mocking the API" for the rationale.
export const handlers: RequestHandler[] = [];
