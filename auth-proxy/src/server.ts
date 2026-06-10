import { app } from './index.js';

const PORT = process.env.PORT ?? '3002';

app.listen(Number(PORT), () => {
  // eslint-disable-next-line no-console -- one-line startup banner; matches the sidecar
  console.log(`auth-proxy listening on port ${PORT}`);
});
