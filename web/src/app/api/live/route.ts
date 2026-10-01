import { handler, requireRole } from '@/lib/auth';
import { liveBoard } from '@/lib/opsService';

export const GET = handler(async (req: Request) => {
  await requireRole('DISPATCHER');
  const depot = new URL(req.url).searchParams.get('depot');
  return liveBoard(depot === 'Peliyagoda' || depot === 'Kandy' ? depot : undefined);
});
