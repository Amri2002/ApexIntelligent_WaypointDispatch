import { handler, requireRole, HttpError } from '@/lib/auth';
import { moveOptions } from '@/lib/planService';

/** Dry run: every vehicle an order could go to, legal ones first, the rest with the blocking rule. */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireRole('DISPATCHER');
  const orderId = new URL(req.url).searchParams.get('orderId');
  if (!orderId) throw new HttpError(400, 'orderId is required');
  return moveOptions((await ctx.params).id, orderId);
});
