import { handler, requireRole } from '@/lib/auth';
import { applyEvents, type SyncEventIn } from '@/lib/opsService';

/** Offline outbox endpoint for loaders and drivers. Events are applied once, in recorded order. */
export const POST = handler(async (req: Request) => {
  const s = await requireRole('LOADER', 'DRIVER');
  const { events } = (await req.json()) as { events: SyncEventIn[] };
  return applyEvents(s, Array.isArray(events) ? events.slice(0, 200) : []);
});
