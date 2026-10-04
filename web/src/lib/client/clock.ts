'use client';
// The browser's view of the shared demo clock. The server sends story time's offset from real
// time; we keep it in localStorage so a phone without signal still stamps records in story time.
import { useEffect, useState } from 'react';

const KEY = 'wp-clock-offset';
let offset = 0;
try { offset = Number(localStorage.getItem(KEY)) || 0; } catch { /* no storage (SSR or private mode) */ }

function save(ms: number) { offset = ms; try { localStorage.setItem(KEY, String(ms)); } catch { /* ignore */ } listeners.forEach((l) => l()); }
const listeners = new Set<() => void>();
let holdAhead: () => boolean = () => false;
/** The outbox tells the clock whether unsent records exist. */
export function setHoldAhead(fn: () => boolean) { holdAhead = fn; }

/** Current story time. */
export function storyNow(): Date { return new Date(Date.now() + offset); }

/** Move this device's clock forward to `t` (used when field work happens offline). */
export function bumpTo(t: Date) { if (t.getTime() > storyNow().getTime()) save(t.getTime() - Date.now()); }

/** Fetch the shared clock from the server (keeps the local copy when offline). */
export async function syncClock() {
  try {
    const r = await fetch('/api/clock', { cache: 'no-store' });
    if (!r.ok) return;
    const c = (await r.json()) as { offsetMs: number };
    if (typeof c.offsetMs !== 'number') return;
    // While this device still holds unsent offline records, never move it backwards (the server
    // catches up when they sync); otherwise follow the server, so Reset demo day reaches every device.
    save(holdAhead() ? Math.max(offset, c.offsetMs) : c.offsetMs);
  } catch { /* offline: keep local clock */ }
}

/** A planned minute-of-day on a date (Sri Lanka time) as a Date. */
export function planTime(date: string, minute: number) { return new Date(new Date(`${date}T00:00:00+05:30`).getTime() + minute * 60_000); }

/** Re-renders every `everyMs` with the current story time; syncs with the server on mount. */
export function useStoryNow(everyMs = 15_000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(storyNow());
    listeners.add(tick); tick();
    void syncClock().then(tick);
    const t = setInterval(() => { void syncClock().then(tick); }, everyMs);
    return () => { listeners.delete(tick); clearInterval(t); };
  }, [everyMs]);
  return now;
}
