import { handler, requireRole } from '@/lib/auth';
import { answerWindowRequest } from '@/lib/planService';
import { db, schema as s } from '@/db';
import { eq } from 'drizzle-orm';

/** Store manager answers a "can you accept a later window?" request, or records the impact of a deferral. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const sess = await requireRole('STORE_MANAGER');
  const { accept, impact, outletId } = await req.json();
  const id = (await ctx.params).id;
  const outlet = outletId || sess.outletId;
  if (impact) {
    const n = (await db.select().from(s.notifications).where(eq(s.notifications.id, id)))[0];
    await db.update(s.notifications).set({ response: impact, readAt: new Date() }).where(eq(s.notifications.id, id));
    if (n?.refId) await db.update(s.deferrals).set({ storeImpact: impact }).where(eq(s.deferrals.id, n.refId));
    await db.insert(s.notifications).values({ audience: 'DISPATCHER', kind: 'store_reply', refId: id, title: `${outlet}: deferral impact`, body: impact });
    return { ok: true };
  }
  return answerWindowRequest(id, !!accept, outlet);
});
