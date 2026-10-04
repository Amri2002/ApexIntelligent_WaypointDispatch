import { handler, requireRole } from '@/lib/auth';
import { nextOperatingDay } from '@/lib/planService';
import { DEMO_DATE } from '@/lib/time';

/** The two days the dispatcher can plan: the demo day and the next operating day (the "next run"). */
export const GET = handler(async () => {
  await requireRole('DISPATCHER');
  return { today: DEMO_DATE, next: await nextOperatingDay(DEMO_DATE) };
});
