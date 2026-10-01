import { handler, requireRole } from '@/lib/auth';
import { decideDeferrals, type Decision } from '@/lib/planService';

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireRole('DISPATCHER');
  const body = (await req.json()) as { decisions: Decision[]; reasonText: string };
  return decideDeferrals((await ctx.params).id, body.decisions ?? [], body.reasonText, s.name);
});
