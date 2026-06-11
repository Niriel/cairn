import { jwtVerify } from 'jose';
import type { RequestHandler, Request, Response, NextFunction } from 'express';

if (!process.env.GOTRUE_JWT_SECRET) throw new Error('GOTRUE_JWT_SECRET is required');
const secret = new TextEncoder().encode(process.env.GOTRUE_JWT_SECRET);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = header.slice(7);
  let sub: string;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    sub = payload.sub ?? '';
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!UUID_RE.test(sub)) {
    res.status(400).json({ error: 'Invalid uid' });
    return;
  }

  req.uid = sub;
  next();
}

// Express can't await the handler, so fire-and-forget the promise; verifyAuth
// resolves the response itself and never rejects (see the auth-proxy idiom).
export const requireAuth: RequestHandler = (req, res, next) => {
  void verifyAuth(req, res, next);
};
