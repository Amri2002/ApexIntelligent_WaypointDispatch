import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, schema as s } from '@/db';
import { COOKIE, createToken, HOME, type Role } from '@/lib/auth';

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  const user = email ? (await db.select().from(s.users).where(eq(s.users.email, String(email).trim().toLowerCase())))[0] : undefined;
  if (!user || !(await bcrypt.compare(String(password ?? ''), user.passwordHash))) {
    return NextResponse.json({ error: 'Email or password is incorrect' }, { status: 401 });
  }
  const role = user.role as Role;
  const token = await createToken({ userId: user.id, name: user.name, email: user.email, role, depot: user.depot, outletId: user.outletId, vehicleId: user.vehicleId });
  const res = NextResponse.json({ ok: true, home: HOME[role], role });
  res.cookies.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 3600, secure: process.env.COOKIE_SECURE === 'true' });
  return res;
}
