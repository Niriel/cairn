import express from 'express';
import { healthzRouter } from './routes/healthz.js';

const app = express();

app.use(express.json());
app.use('/healthz', healthzRouter);

export { app };
