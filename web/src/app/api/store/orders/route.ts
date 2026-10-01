import { handler, requireRole } from '@/lib/auth';
import { placeStoreOrder, catalogue } from '@/lib/opsService';

export const GET = handler(async () => { await requireRole('STORE_MANAGER'); return catalogue(); });
export const POST = handler(async (req: Request) => {
  const s = await requireRole('STORE_MANAGER');
  const { outletId, lines } = await req.json();
  return placeStoreOrder(outletId || s.outletId, lines ?? []);
});
