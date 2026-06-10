import express from 'express';

const app = express();

// Health check for the compose healthcheck. The shim middleware (the
// cookie/JWT translation for /auth/*) is added in Task 1.2.
app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

export { app };
