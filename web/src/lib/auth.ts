// Session handling: a signed JWT in an httpOnly cookie. Four roles, one seeded account each.
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export type Role = 'DISPATCHER' | 'LOADER' | 'DRIVER' | 'STORE_MANAGER';
export interface Session { userId: string; name: string; email: string; role: Role; depot: string | null; outletId: string | null; vehicleId: string | null }

export const COOKIE = 'wp_session';
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || 'insecure-dev-secret-change-me');

export const HOME: Record<Role, string> = { DISPATCHER: '/dispatcher', LOADER: '/loader', DRIVER: '/driver', STORE_MANAGER: '/store' };

export async function createToken(s: Session) {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret());
}

export async function verifyToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, secret()); return payload as unknown as Session; } catch { return null; }
}

export async function getSession() {
  const store = await cookies();
  return verifyToken(store.get(COOKIE)?.value);
}

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

/** For API routes: returns the session or throws 401/403. */
export async function requireRole(...roles: Role[]) {
  const s = await getSession();
  if (!s) throw new HttpError(401, 'Please sign in');
  if (roles.length && !roles.includes(s.role)) throw new HttpError(403, 'Your role cannot do this');
  return s;
}

/** Wraps a route handler with consistent JSON error responses. */
export function handler<T extends unknown[]>(fn: (...args: T) => Promise<unknown>) {
  return async (...args: T) => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: 'Something went wrong on the server' }, { status: 500 });
    }
  };
}
