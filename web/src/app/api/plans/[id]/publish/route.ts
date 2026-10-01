import { handler, requireRole } from '@/lib/auth';
import { publishPlan } from '@/lib/planService';

export const POST = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireRole('DISPATCHER');
  return publishPlan((await ctx.params).id, s.name);
});
