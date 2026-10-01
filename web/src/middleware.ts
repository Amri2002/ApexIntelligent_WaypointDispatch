import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Page access by role. API routes check roles themselves (see lib/auth.ts).
const AREA: Record<string, string> = { '/dispatcher': 'DISPATCHER', '/loader': 'LOADER', '/driver': 'DRIVER', '/store': 'STORE_MANAGER' };
const HOME: Record<string, string> = { DISPATCHER: '/dispatcher', LOADER: '/loader', DRIVER: '/driver', STORE_MANAGER: '/store' };

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const area = Object.keys(AREA).find((a) => pathname === a || pathname.startsWith(a + '/'));
  if (!area && pathname !== '/') return NextResponse.next();
  let role: string | null = null;
  const token = req.cookies.get('wp_session')?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET || 'insecure-dev-secret-change-me'));
      role = payload.role as string;
    } catch { role = null; }
  }
  if (!role) return NextResponse.redirect(new URL('/login', req.url));
  if (pathname === '/') return NextResponse.redirect(new URL(HOME[role], req.url));
  if (area && AREA[area] !== role) return NextResponse.redirect(new URL(HOME[role], req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/', '/dispatcher/:path*', '/loader/:path*', '/driver/:path*', '/store/:path*'] };
