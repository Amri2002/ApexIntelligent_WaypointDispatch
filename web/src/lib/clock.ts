// Demo clock persistence: one row in app_settings holds the anchor { storyMs, realMs };
// story time = storyMs + (real now - realMs), so the clock keeps running at normal speed.
import { eq } from 'drizzle-orm';
import { db, schema as s } from '@/db';
import { DEMO_CLOCK, demoNow, setClockOffset, clockOffset } from './clockState';

export { DEMO_CLOCK, demoNow, clockOffset };
const KEY = 'demo_clock';

/** Reads the clock from the database into this process (called at the start of every API request). */
export async function loadClock() {
  if (!DEMO_CLOCK) return;
  const row = (await db.select().from(s.appSettings).where(eq(s.appSettings.key, KEY)))[0];
  const v = row?.value as { storyMs: number; realMs: number } | undefined;
  setClockOffset(v ? v.storyMs - v.realMs : 0);
}

/** Sets story time to `to` (the presenter's jump, or a reset). */
export async function setStoryTime(to: Date) {
  if (!DEMO_CLOCK) return;
  const value = { storyMs: to.getTime(), realMs: Date.now() };
  await db.insert(s.appSettings).values({ key: KEY, value }).onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
  setClockOffset(value.storyMs - value.realMs);
}

/** Moves story time forward to `t` if it is later than now (field work never moves the clock back). */
export async function advanceTo(t: Date) {
  if (DEMO_CLOCK && t.getTime() > demoNow().getTime()) await setStoryTime(t);
}
