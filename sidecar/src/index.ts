import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { healthzRouter } from './routes/healthz.js';
import { avatarsRouter } from './routes/avatars.js';

const app = express();

// No body parser: uploads are multipart (multer, in the avatars router) and no
// route reads a JSON body. A JSON parser would attach the raw text of a
// malformed body to the error the handler below logs (docs/logging.md).
app.use('/healthz', healthzRouter);
app.use('/avatars', avatarsRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
	console.error(err);
	res.status(500).json({ error: 'Internal server error' });
});

export { app };
