import { handler, requireRole } from '@/lib/auth';
import { forecast } from '@/lib/opsService';

export const GET = handler(async (req: Request) => {
  await requireRole('DISPATCHER');
  return forecast(new URL(req.url).searchParams.get('depot') === 'Kandy' ? 'Kandy' : 'Peliyagoda');
});
