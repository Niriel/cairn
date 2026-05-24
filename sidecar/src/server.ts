import { app } from './index.js';

const PORT = process.env.PORT ?? '3001';

app.listen(Number(PORT), () => {
  console.log(`sidecar listening on port ${PORT}`);
});
