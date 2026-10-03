import { handler, requireRole, DEMO_MODE, ownVehicle } from '@/lib/auth';
import { driverRun } from '@/lib/opsService';

export const GET = handler(async (req: Request) => {
  const s = await requireRole('DRIVER');
  const requested = new URL(req.url).searchParams.get('vehicle');
  return driverRun(s, DEMO_MODE ? requested : ownVehicle(s, requested));
});
