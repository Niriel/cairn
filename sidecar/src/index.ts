import express from 'express';
import { healthzRouter } from './routes/healthz.js';
import { avatarsRouter } from './routes/avatars.js';

const app = express();

app.use(express.json());
app.use('/healthz', healthzRouter);
app.use('/avatars', avatarsRouter);

export { app };
