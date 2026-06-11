import { app } from './index.js';

const PORT = process.env.PORT ?? '3001';

app.listen(Number(PORT), () => {
  // eslint-disable-next-line no-console -- one-line startup banner; matches the auth-proxy
  console.log(`sidecar listening on port ${PORT}`);
});
