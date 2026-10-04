import { handler, requireRole, HttpError } from '@/lib/auth';
import { DEMO_CLOCK, demoNow, clockOffset, setStoryTime } from '@/lib/clock';

/** The shared demo clock: story time, and its offset from real time for clients to follow offline. */
export const GET = handler(async () => {
  await requireRole('DISPATCHER', 'LOADER', 'DRIVER', 'STORE_MANAGER');
  return { demo: DEMO_CLOCK, now: demoNow().toISOString(), offsetMs: clockOffset() };
});

/** The presenter moves story time forward: { addMin } or { set: ISO time }. Dispatcher only. */
export const POST = handler(async (req: Request) => {
  await requireRole('DISPATCHER');
  if (!DEMO_CLOCK) throw new HttpError(409, 'The demo clock is off (DEMO_MODE=false); the system runs on real time');
  const body = (await req.json()) as { addMin?: number; set?: string };
  const now = demoNow();
  const to = body.set ? new Date(body.set) : new Date(now.getTime() + (Number(body.addMin) || 0) * 60_000);
  if (Number.isNaN(to.getTime())) throw new HttpError(400, 'Not a valid time');
  if (to.getTime() < now.getTime()) throw new HttpError(400, 'The demo clock only moves forward; use Reset demo day to start over');
  if (to.getTime() - now.getTime() > 3 * 24 * 3600_000) throw new HttpError(400, 'That is more than three days ahead');
  await setStoryTime(to);
  return { demo: DEMO_CLOCK, now: demoNow().toISOString(), offsetMs: clockOffset() };
});
