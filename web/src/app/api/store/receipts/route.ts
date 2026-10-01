import { handler, requireRole } from '@/lib/auth';
import { recordReceipt } from '@/lib/opsService';

export const POST = handler(async (req: Request) => {
  const s = await requireRole('STORE_MANAGER');
  const body = await req.json();
  return recordReceipt(body.outletId || s.outletId, body.stopId, body);
});
