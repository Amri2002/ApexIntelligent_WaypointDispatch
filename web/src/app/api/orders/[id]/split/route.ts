import { handler, requireRole } from '@/lib/auth';
import { splitOrder } from '@/lib/planService';

export const POST = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireRole('DISPATCHER');
  return splitOrder((await ctx.params).id);
});
