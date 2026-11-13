import crypto from 'node:crypto';

const JWT_SECRET = process.env['JWT_SECRET'] || 'synvapp-dev-secret-change-me';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface JwtPayload {
  sub: number;
  email: string;
  iat: number;
  exp: number;
}

function hmac(data: string): string {
  return crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function signToken(userId: number, email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, email, iat: now, exp: now + TOKEN_TTL_SECONDS })
  ).toString('base64url');
  const signature = hmac(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expected = hmac(`${header}.${payload}`);

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as JwtPayload;
    if (typeof decoded.exp !== 'number' || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function getPayloadFromRequest(req: Request): JwtPayload | null {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7));
}
