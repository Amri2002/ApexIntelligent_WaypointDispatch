import { handler, requireRole, DEMO_MODE, ownDepot } from '@/lib/auth';
import { loaderDepartures } from '@/lib/opsService';

export const GET = handler(async (req: Request) => {
  const s = await requireRole('LOADER');
  const d = new URL(req.url).searchParams.get('depot');
  if (!DEMO_MODE) return loaderDepartures(ownDepot(s, d));
  return loaderDepartures(d === 'Peliyagoda' || d === 'Kandy' ? d : s.depot || 'Kandy');
});
