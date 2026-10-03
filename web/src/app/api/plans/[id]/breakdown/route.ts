import { handler, requireRole, HttpError } from '@/lib/auth';
import { reportBreakdown } from '@/lib/planService';

/** The dispatcher reports that a vehicle on a published plan has broken down. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireRole('DISPATCHER');
  const { vehicleId } = await req.json();
  if (!vehicleId) throw new HttpError(400, 'Which vehicle broke down?');
  return reportBreakdown((await ctx.params).id, String(vehicleId), s.name);
});
