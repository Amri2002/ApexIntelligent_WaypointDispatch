export const DEMO_DATE = process.env.DEMO_DATE || '2026-04-10';
export const DEPOTS = ['Peliyagoda', 'Kandy'] as const;

export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fmt = (min: number | null | undefined) => (min == null ? '—' : `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min) % 60).padStart(2, '0')}`);

export function prettyDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

/** Clock time in Sri Lanka for a timestamp. */
export function slTime(d: Date | string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' });
}
