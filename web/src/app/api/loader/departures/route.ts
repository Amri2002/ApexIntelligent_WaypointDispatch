import { handler, requireRole } from '@/lib/auth';
import { loaderDepartures } from '@/lib/opsService';

export const GET = handler(async (req: Request) => {
  const s = await requireRole('LOADER');
  const d = new URL(req.url).searchParams.get('depot');
  return loaderDepartures(d === 'Peliyagoda' || d === 'Kandy' ? d : s.depot || 'Kandy');
});
