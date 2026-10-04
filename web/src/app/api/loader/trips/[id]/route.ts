import { handler, requireRole } from '@/lib/auth';
import { loaderTrip } from '@/lib/opsService';

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireRole('LOADER');
  return loaderTrip((await ctx.params).id, s);
});
