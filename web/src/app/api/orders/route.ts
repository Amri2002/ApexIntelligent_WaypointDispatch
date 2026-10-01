import { and, eq, asc } from 'drizzle-orm';
import { db, schema as s } from '@/db';
import { handler, requireRole } from '@/lib/auth';
import { DEMO_DATE } from '@/lib/time';

/** The dispatcher's order queue for one depot and delivery date. */
export const GET = handler(async (req: Request) => {
  await requireRole('DISPATCHER');
  const u = new URL(req.url);
  const depot = u.searchParams.get('depot') || 'Peliyagoda';
  const date = u.searchParams.get('date') || DEMO_DATE;
  const [orders, outlets, vehicles, cal] = await Promise.all([
    db.select().from(s.orders).where(and(eq(s.orders.depot, depot), eq(s.orders.deliveryDate, date))).orderBy(asc(s.orders.ref)),
    db.select().from(s.outlets), db.select().from(s.vehicles).where(eq(s.vehicles.depot, depot)),
    db.select().from(s.calendarDays).where(eq(s.calendarDays.date, date)),
  ]);
  const later = await db.select().from(s.orders).where(and(eq(s.orders.depot, depot), eq(s.orders.source, 'app'))).then((rows) => rows.filter((o) => o.deliveryDate > date && !o.parentRef));
  return { depot, date, calendar: cal[0] ?? null, orders: orders.map((o) => ({ ...o, outlet: outlets.find((x) => x.id === o.outletId)! })), vehicles, laterOrders: later.map((o) => ({ ...o, outlet: outlets.find((x) => x.id === o.outletId)! })) };
});
