import { handler, requireRole } from '@/lib/auth';
import { driverRun } from '@/lib/opsService';

export const GET = handler(async (req: Request) => {
  const s = await requireRole('DRIVER');
  return driverRun(s, new URL(req.url).searchParams.get('vehicle'));
});
