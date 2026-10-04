import { handler, requireRole, ownOutlet } from '@/lib/auth';
import { placeStoreOrder, orderForm } from '@/lib/opsService';

/** The order form for the store's outlet: its brand's products and its next delivery day. */
export const GET = handler(async (req: Request) => {
  const s = await requireRole('STORE_MANAGER');
  return orderForm(ownOutlet(s, new URL(req.url).searchParams.get('outlet')));
});
export const POST = handler(async (req: Request) => {
  const s = await requireRole('STORE_MANAGER');
  const { outletId, lines } = await req.json();
  return placeStoreOrder(ownOutlet(s, outletId), lines ?? []);
});
