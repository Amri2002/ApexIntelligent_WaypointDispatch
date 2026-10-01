import { NextResponse } from 'next/server';
import { requireRole, HttpError } from '@/lib/auth';
import { moveOrder } from '@/lib/planService';

/** Manual edit: move an order onto a vehicle, or take it off the plan. Rejected with reasons if it breaks a rule. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('DISPATCHER');
    const { orderId, vehicleId, unplace } = await req.json();
    return NextResponse.json(await moveOrder((await ctx.params).id, orderId, { vehicleId, unplace }));
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message, violations: (e as HttpError & { violations?: unknown }).violations ?? [] }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: 'Something went wrong on the server' }, { status: 500 });
  }
}
