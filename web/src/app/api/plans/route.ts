import { handler, requireRole, HttpError } from '@/lib/auth';
import { generatePlan, getPlanView } from '@/lib/planService';
import { DEMO_DATE } from '@/lib/time';

const depotOf = (v: string | null) => { if (v !== 'Peliyagoda' && v !== 'Kandy') throw new HttpError(400, 'Unknown depot'); return v; };

export const GET = handler(async (req: Request) => {
  await requireRole('DISPATCHER');
  const u = new URL(req.url);
  return getPlanView(depotOf(u.searchParams.get('depot')), u.searchParams.get('date') || DEMO_DATE);
});

/** Runs the planning engine and stores a new draft plan. */
export const POST = handler(async (req: Request) => {
  await requireRole('DISPATCHER');
  const { depot, date } = await req.json();
  return generatePlan(depotOf(depot), date || DEMO_DATE);
});
