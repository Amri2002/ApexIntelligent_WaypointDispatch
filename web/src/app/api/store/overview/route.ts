import { handler, requireRole } from '@/lib/auth';
import { storeOverview } from '@/lib/opsService';

export const GET = handler(async (req: Request) => {
  const s = await requireRole('STORE_MANAGER');
  return storeOverview(new URL(req.url).searchParams.get('outlet') || s.outletId || 'OUT106');
});
