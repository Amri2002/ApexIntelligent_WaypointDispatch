// Server-side planning workflow: build engine input from the database, store the plan,
// record deferral decisions, publish, and validate manual edits.
import { and, eq, inArray, sql, asc } from 'drizzle-orm';
import { db, schema as s } from '@/db';
import { Engine, planDay, type Draft } from './engine/plan';
import type { EngineInput, EOrder, PlannedTrip } from './engine/types';
import { HttpError } from './auth';
import { prettyDate } from './time';

export const REASON_LABEL: Record<string, string> = {
  REEFER_CAPACITY: 'Refrigerated capacity',
  VAN_CAPACITY: 'Van capacity',
  WINDOW: 'Delivery window unreachable',
  FUEL: 'Weekly fuel quota',
  FLEET_CAPACITY: 'Fleet capacity',
  OVERSIZE: 'Larger than any vehicle',
  MANUAL: 'Dispatcher decision',
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export async function nextOperatingDay(date: string) {
  const rows = await db.select().from(s.calendarDays).where(sql`${s.calendarDays.date} > ${date} AND ${s.calendarDays.isOperating} = true`).orderBy(asc(s.calendarDays.date)).limit(1);
  if (rows[0]) return rows[0].date;
  const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);
}

/** Orders that the planner should consider for a depot and date. */
async function plannableOrders(depot: string, date: string) {
  return db.select().from(s.orders).where(and(eq(s.orders.depot, depot), eq(s.orders.deliveryDate, date), inArray(s.orders.status, ['confirmed', 'planned'])));
}

export async function engineInput(depot: string, date: string, extra: Partial<EngineInput> = {}): Promise<EngineInput> {
  const [outlets, vehicles, travel, service, speed, cal, orders] = await Promise.all([
    db.select().from(s.outlets), db.select().from(s.vehicles), db.select().from(s.districtTravel), db.select().from(s.serviceAllowance), db.select().from(s.trafficSpeed),
    db.select().from(s.calendarDays).where(eq(s.calendarDays.date, date)), plannableOrders(depot, date),
  ]);
  return {
    date, depot, monsoon: !!cal[0]?.monsoon,
    orders: orders.map(toEOrder),
    outlets: new Map(outlets.map((o) => [o.id, o])),
    vehicles,
    travel: new Map(travel.map((t) => [t.district, t])),
    service: new Map(service.map((x) => [`${x.brand}|${x.dockType}`, x.minutes])),
    speed: new Map(speed.map((x) => [`${x.district}|${x.hour}|${x.monsoon}`, x.speedIndex])),
    ...extra,
  };
}

const toEOrder = (o: typeof s.orders.$inferSelect): EOrder => ({
  id: o.id, ref: o.ref, outletId: o.outletId, brand: o.brand, temp: o.temp as EOrder['temp'], units: o.units, weightKg: o.weightKg, volumeM3: o.volumeM3,
  deferredYesterday: o.deferredYesterday, daysSinceLastServed: o.daysSinceLastServed,
});

async function getPlanRow(depot: string, date: string) {
  return (await db.select().from(s.plans).where(and(eq(s.plans.depot, depot), eq(s.plans.date, date))))[0] ?? null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function writeTrips(tx: Tx, planId: string, trips: PlannedTrip[]) {
  for (const t of trips) {
    const [trip] = await tx.insert(s.trips).values({
      planId, vehicleId: t.vehicleId, tripNo: t.tripNo, brand: t.brand, district: t.district, carriesChilled: t.carriesChilled,
      startMin: t.startMin, tripMinutes: t.tripMinutes, km: t.km, fuelL: t.fuelL, loadKg: t.loadKg, loadM3: t.loadM3,
    }).returning();
    for (let i = 0; i < t.stops.length; i++) {
      const st = t.stops[i];
      const [stop] = await tx.insert(s.stops).values({ tripId: trip.id, seq: i + 1, outletId: st.outletId, etaMin: st.etaMin, predServiceMin: st.predServiceMin, lateRisk: st.lateRisk }).returning();
      await tx.update(s.orders).set({ stopId: stop.id, status: 'planned' }).where(inArray(s.orders.id, st.orderIds));
    }
  }
}

/** Runs the engine and stores a fresh draft plan (replacing any previous draft). */
export async function generatePlan(depot: string, date: string) {
  const existing = await getPlanRow(depot, date);
  if (existing?.status === 'published') throw new HttpError(409, 'This plan is already published');
  const input = await engineInput(depot, date);
  const result = planDay(input);
  const toDate = await nextOperatingDay(date);
  const suggestions = Object.fromEntries(result.deferred.filter((d) => d.suggestion).map((d) => [d.orderId, d.suggestion]));

  await db.transaction(async (tx) => {
    const orderIds = input.orders.map((o) => o.id);
    if (orderIds.length) {
      await tx.update(s.orders).set({ stopId: null, status: 'confirmed' }).where(inArray(s.orders.id, orderIds));
      await tx.delete(s.deferrals).where(and(inArray(s.deferrals.orderId, orderIds), inArray(s.deferrals.status, ['proposed', 'requested'])));
    }
    if (existing) await tx.delete(s.plans).where(eq(s.plans.id, existing.id));
    const [plan] = await tx.insert(s.plans).values({ depot, date, summary: { stats: result.stats, suggestions, generatedAt: new Date().toISOString() } }).returning();
    await writeTrips(tx, plan.id, result.trips);
    for (const d of result.deferred) {
      await tx.insert(s.deferrals).values({ orderId: d.orderId, fromDate: date, toDate, reasonCode: d.reason, reasonText: d.reasonText, rank: d.rank, status: 'proposed' });
    }
  });
  return getPlanView(depot, date);
}

/** Everything the plan screen needs. */
export async function getPlanView(depot: string, date: string) {
  const plan = await getPlanRow(depot, date);
  const [vehicles, outlets, allOrders, calendar] = await Promise.all([
    db.select().from(s.vehicles).where(eq(s.vehicles.depot, depot)),
    db.select().from(s.outlets),
    db.select().from(s.orders).where(and(eq(s.orders.depot, depot), eq(s.orders.deliveryDate, date))),
    db.select().from(s.calendarDays).where(eq(s.calendarDays.date, date)),
  ]);
  const outletMap = new Map(outlets.map((o) => [o.id, o]));
  let trips: (typeof s.trips.$inferSelect & { stops: (typeof s.stops.$inferSelect & { orders: typeof allOrders })[] })[] = [];
  let deferralRows: (typeof s.deferrals.$inferSelect)[] = [];
  if (plan) {
    const tripRows = await db.select().from(s.trips).where(eq(s.trips.planId, plan.id)).orderBy(asc(s.trips.vehicleId), asc(s.trips.tripNo));
    const stopRows = tripRows.length ? await db.select().from(s.stops).where(inArray(s.stops.tripId, tripRows.map((t) => t.id))).orderBy(asc(s.stops.seq)) : [];
    trips = tripRows.map((t) => ({ ...t, stops: stopRows.filter((x) => x.tripId === t.id).map((x) => ({ ...x, orders: allOrders.filter((o) => o.stopId === x.id) })) }));
  }
  const ids = allOrders.map((o) => o.id);
  if (ids.length) deferralRows = await db.select().from(s.deferrals).where(inArray(s.deferrals.orderId, ids)).orderBy(asc(s.deferrals.rank));
  const yesterdaySkips = new Set(allOrders.filter((o) => o.deferredYesterday).map((o) => o.outletId));
  const suggestions = ((plan?.summary as { suggestions?: Record<string, unknown> } | null)?.suggestions ?? {}) as Record<string, { vehicleId: string; tripNo: number; newCloseMin: number; extraMin: number }>;
  const deferred = deferralRows.map((d) => {
    const o = allOrders.find((x) => x.id === d.orderId)!;
    return { ...d, order: o, outlet: outletMap.get(o.outletId)!, outletSkippedYesterday: yesterdaySkips.has(o.outletId), suggestion: suggestions[o.id] ?? null };
  });
  const placed = allOrders.filter((o) => o.stopId);
  const chilled = allOrders.filter((o) => o.temp === 'chilled' && o.status !== 'split');
  const avail = vehicles.filter((v) => v.status === 'available');
  return {
    depot, date, dateLabel: prettyDate(date, { weekday: 'long', day: 'numeric', month: 'long' }), calendar: calendar[0] ?? null,
    plan: plan ? { id: plan.id, status: plan.status, createdAt: plan.createdAt, publishedAt: plan.publishedAt, publishedBy: plan.publishedBy, stats: (plan.summary as { stats?: unknown } | null)?.stats ?? null } : null,
    trips: trips.map((t) => ({ ...t, vehicle: vehicles.find((v) => v.id === t.vehicleId)!, stops: t.stops.map((x) => ({ ...x, outlet: outletMap.get(x.outletId)! })) })),
    deferred,
    vehicles: vehicles.map((v) => ({ ...v, fuelLeftL: r1(v.weeklyFuelQuotaL - v.fuelUsedWeekL - trips.filter((t) => t.vehicleId === v.id).reduce((a, t) => a + t.fuelL, 0)) })),
    totals: {
      orders: allOrders.filter((o) => o.status !== 'split').length,
      placed: placed.length,
      chilledM3: r1(chilled.reduce((a, o) => a + o.volumeM3, 0)),
      chilledPlacedM3: r1(chilled.filter((o) => o.stopId).reduce((a, o) => a + o.volumeM3, 0)),
      volumeM3: r1(allOrders.filter((o) => o.status !== 'split').reduce((a, o) => a + o.volumeM3, 0)),
      reeferCapacityM3: r1(avail.filter((v) => v.temp === 'reefer').reduce((a, v) => a + v.volumeCapM3, 0)),
      reefersAvailable: avail.filter((v) => v.temp === 'reefer').length,
      reefersTotal: vehicles.filter((v) => v.temp === 'reefer').length,
      workshop: vehicles.filter((v) => v.status !== 'available').map((v) => v.id),
      reeferWorkshop: vehicles.filter((v) => v.status !== 'available' && v.temp === 'reefer').map((v) => v.id),
      vehiclesAvailable: avail.length,
      vehiclesUsed: new Set(trips.map((t) => t.vehicleId)).size,
      lateRiskStops: trips.reduce((a, t) => a + t.stops.filter((x) => x.lateRisk > 0.3).length, 0),
      undecided: deferralRows.filter((d) => d.status === 'proposed').length,
      awaitingStores: deferralRows.filter((d) => d.status === 'requested').length,
    },
  };
}
export type PlanView = Awaited<ReturnType<typeof getPlanView>>;

// ---------- Deferral decisions ----------

export interface Decision { orderId: string; action: 'defer' | 'request_window'; note?: string }

export async function decideDeferrals(planId: string, decisions: Decision[], reasonText: string, user: string) {
  if (!reasonText?.trim()) throw new HttpError(400, 'A reason is required for every deferral');
  const plan = (await db.select().from(s.plans).where(eq(s.plans.id, planId)))[0];
  if (!plan) throw new HttpError(404, 'Plan not found');
  const view = await getPlanView(plan.depot, plan.date);
  const missingNotes = decisions.filter((d) => {
    const row = view.deferred.find((x) => x.orderId === d.orderId);
    return d.action === 'defer' && row?.outletSkippedYesterday && !d.note?.trim();
  });
  if (missingNotes.length) throw new HttpError(400, `Add a note for outlets skipped yesterday: ${missingNotes.map((d) => view.deferred.find((x) => x.orderId === d.orderId)!.outlet.id).join(', ')}`);

  await db.transaction(async (tx) => {
    for (const d of decisions) {
      const row = view.deferred.find((x) => x.orderId === d.orderId);
      if (!row || row.status === 'confirmed') continue;
      if (d.action === 'request_window' && row.suggestion) {
        const sug = row.suggestion;
        await tx.update(s.deferrals).set({ status: 'requested', note: d.note ?? null, decidedBy: user, decidedAt: new Date() }).where(eq(s.deferrals.id, row.id));
        const close = `${String(Math.floor(sug.newCloseMin / 60)).padStart(2, '0')}:${String(sug.newCloseMin % 60).padStart(2, '0')}`;
        await tx.insert(s.notifications).values({
          audience: `OUTLET:${row.outlet.id}`, kind: 'window_request', refId: row.id,
          title: `Can you accept delivery until ${close}?`,
          body: `We are short of refrigerated capacity on ${prettyDate(plan.date)}. ${sug.vehicleId} can bring your chilled order ${row.order.ref} if you can receive it until ${close} (your window closes ${row.outlet.windowClose}). Otherwise it moves to ${prettyDate(row.toDate)}.`,
        });
      } else {
        await confirmOne(tx, row, reasonText, d.note ?? null, user);
      }
    }
  });
  return getPlanView(plan.depot, plan.date);
}

type DeferredRow = PlanView['deferred'][number];
async function confirmOne(tx: Tx, row: DeferredRow, reasonText: string, note: string | null, user: string) {
  await tx.update(s.deferrals).set({ status: 'confirmed', reasonText, note, decidedBy: user, decidedAt: new Date() }).where(eq(s.deferrals.id, row.id));
  await tx.update(s.orders).set({ status: 'deferred', stopId: null }).where(eq(s.orders.id, row.orderId));
  // The order goes to the next run, locked: it cannot be deferred again without a note.
  await tx.insert(s.orders).values({
    ref: `${row.order.ref}-D`, outletId: row.order.outletId, depot: row.order.depot, brand: row.order.brand, temp: row.order.temp, units: row.order.units,
    weightKg: row.order.weightKg, volumeM3: row.order.volumeM3, deliveryDate: row.toDate, source: row.order.source, deferredYesterday: true, daysSinceLastServed: row.order.daysSinceLastServed + 1, parentRef: row.order.ref,
  }).onConflictDoNothing();
  await tx.insert(s.notifications).values({
    audience: `OUTLET:${row.outlet.id}`, kind: 'deferral', refId: row.id,
    title: `Your ${row.order.temp} order arrives ${prettyDate(row.toDate, { weekday: 'long' })}, not ${prettyDate(row.fromDate, { weekday: 'long' })}`,
    body: JSON.stringify({ orderRef: row.order.ref, units: row.order.units, temp: row.order.temp, from: row.fromDate, to: row.toDate, reason: reasonText, decidedBy: user, outletWindow: `${row.outlet.windowOpen}–${row.outlet.windowClose}` }),
  });
}

/** Store manager answers a window-extension request. */
export async function answerWindowRequest(notificationId: string, accept: boolean, outletId: string) {
  const n = (await db.select().from(s.notifications).where(eq(s.notifications.id, notificationId)))[0];
  if (!n || n.audience !== `OUTLET:${outletId}` || n.kind !== 'window_request') throw new HttpError(404, 'Request not found');
  if (n.response) throw new HttpError(409, 'Already answered');
  const def = (await db.select().from(s.deferrals).where(eq(s.deferrals.id, n.refId!)))[0];
  const order = (await db.select().from(s.orders).where(eq(s.orders.id, def.orderId)))[0];
  const plan = (await db.select().from(s.plans).where(and(eq(s.plans.depot, order.depot), eq(s.plans.date, order.deliveryDate))))[0];
  const view = await getPlanView(order.depot, order.deliveryDate);
  const row = view.deferred.find((d) => d.id === def.id)!;
  await db.update(s.notifications).set({ response: accept ? 'accepted' : 'declined', readAt: new Date() }).where(eq(s.notifications.id, n.id));
  if (accept && row.suggestion) {
    const ext = new Map([[order.outletId, row.suggestion.extraMin]]);
    const res = await moveOrder(plan.id, order.id, { vehicleId: row.suggestion.vehicleId }, ext).catch((e) => e as Error);
    if (!(res instanceof Error)) {
      await db.delete(s.deferrals).where(eq(s.deferrals.id, def.id));
      await db.insert(s.notifications).values({ audience: 'DISPATCHER', kind: 'store_reply', refId: order.id, title: `${order.outletId} accepted a later window`, body: `${order.ref} is now on ${row.suggestion.vehicleId}.` });
      return { placed: true };
    }
  }
  await db.transaction(async (tx) => confirmOne(tx, row, 'Refrigerated capacity: vehicles in workshop', accept ? 'Store accepted, but the slot was no longer free' : 'Store declined a later window', 'system'));
  await db.insert(s.notifications).values({ audience: 'DISPATCHER', kind: 'store_reply', refId: order.id, title: `${order.outletId} ${accept ? 'accepted' : 'declined'} the later window`, body: `${order.ref} moves to ${prettyDate(row.toDate)}.` });
  return { placed: false };
}

export async function publishPlan(planId: string, user: string) {
  const plan = (await db.select().from(s.plans).where(eq(s.plans.id, planId)))[0];
  if (!plan) throw new HttpError(404, 'Plan not found');
  const view = await getPlanView(plan.depot, plan.date);
  if (view.totals.undecided > 0) throw new HttpError(409, `Decide the ${view.totals.undecided} unplaced orders first`);
  await db.update(s.plans).set({ status: 'published', publishedAt: new Date(), publishedBy: user, updatedAt: new Date() }).where(eq(s.plans.id, planId));
  await db.insert(s.notifications).values({ audience: `LOADER:${plan.depot}`, kind: 'plan_change', title: `Plan for ${prettyDate(plan.date)} published`, body: `${view.trips.length} trips on ${view.totals.vehiclesUsed} vehicles.` });
  return getPlanView(plan.depot, plan.date);
}

// ---------- Manual edits with validation ----------

/** Rebuilds engine drafts for one vehicle from the stored plan. */
function draftsFor(view: PlanView, vehicleId: string): Draft[] {
  return view.trips.filter((t) => t.vehicleId === vehicleId).map((t) => ({ brand: t.brand, district: t.district, orders: t.stops.flatMap((x) => x.orders.map(toEOrder)) }));
}

/**
 * Moves an order onto a vehicle (joining its trip to the same brand and district, or opening a
 * new trip) or takes it off the plan. Every affected vehicle's day is re-validated; the change is
 * rejected with reasons if any rule breaks.
 */
export async function moveOrder(planId: string, orderId: string, target: { vehicleId?: string; unplace?: boolean }, windowExtensions?: Map<string, number>) {
  const plan = (await db.select().from(s.plans).where(eq(s.plans.id, planId)))[0];
  if (!plan) throw new HttpError(404, 'Plan not found');
  if (plan.status === 'published') throw new HttpError(409, 'Published plans are read-only in this build');
  const view = await getPlanView(plan.depot, plan.date);
  const order = (await db.select().from(s.orders).where(eq(s.orders.id, orderId)))[0];
  if (!order) throw new HttpError(404, 'Order not found');
  const input = await engineInput(plan.depot, plan.date, { windowExtensions });
  const engine = new Engine(input);
  const eo = toEOrder(order);
  const outlet = input.outlets.get(order.outletId)!;

  const fromTrip = view.trips.find((t) => t.stops.some((x) => x.orders.some((o) => o.id === orderId)));
  const changes = new Map<string, Draft[]>();
  if (fromTrip) changes.set(fromTrip.vehicleId, draftsFor(view, fromTrip.vehicleId).map((d) => ({ ...d, orders: d.orders.filter((o) => o.id !== orderId) })).filter((d) => d.orders.length));
  if (target.vehicleId) {
    const v = input.vehicles.find((x) => x.id === target.vehicleId);
    if (!v) throw new HttpError(404, 'Vehicle not found');
    const base = changes.get(v.id) ?? draftsFor(view, v.id);
    const i = base.findIndex((d) => d.brand === outlet.brand && d.district === outlet.district);
    const next = i >= 0 ? base.map((d, j) => (j === i ? { ...d, orders: [...d.orders, eo] } : d)) : [...base, { brand: outlet.brand, district: outlet.district, orders: [eo] }];
    const violations = engine.validate(v, next);
    if (violations.length) throw Object.assign(new HttpError(422, violations.map((x) => x.message).join(' · ')), { violations });
    changes.set(v.id, next);
  }
  // Re-schedule every affected vehicle and replace its trips.
  const rescheduled = new Map<string, PlannedTrip[]>();
  for (const [vid, drafts] of changes) {
    const v = input.vehicles.find((x) => x.id === vid)!;
    const res = drafts.length ? engine.scheduleVehicle(v, drafts) : { trips: [] };
    if (!res.trips) throw new HttpError(422, res.violation!.message);
    rescheduled.set(vid, res.trips);
  }
  await db.transaction(async (tx) => {
    const affected = view.trips.filter((t) => changes.has(t.vehicleId));
    const affectedOrderIds = affected.flatMap((t) => t.stops.flatMap((x) => x.orders.map((o) => o.id)));
    if (affectedOrderIds.length) await tx.update(s.orders).set({ stopId: null, status: 'confirmed' }).where(inArray(s.orders.id, affectedOrderIds));
    if (affected.length) await tx.delete(s.trips).where(inArray(s.trips.id, affected.map((t) => t.id)));
    for (const trips of rescheduled.values()) await writeTrips(tx, planId, trips);
    if (target.vehicleId) await tx.delete(s.deferrals).where(and(eq(s.deferrals.orderId, orderId), inArray(s.deferrals.status, ['proposed', 'requested'])));
    if (target.unplace) {
      const toDate = await nextOperatingDay(plan.date);
      await tx.insert(s.deferrals).values({ orderId, fromDate: plan.date, toDate, reasonCode: 'MANUAL', reasonText: 'Taken off the plan by the dispatcher', rank: 99, status: 'proposed' });
    }
    await tx.update(s.plans).set({ updatedAt: new Date() }).where(eq(s.plans.id, planId));
  });
  return getPlanView(plan.depot, plan.date);
}

/** Splits an order that is larger than any vehicle into two loads, then re-plans the draft. */
export async function splitOrder(orderId: string) {
  const o = (await db.select().from(s.orders).where(eq(s.orders.id, orderId)))[0];
  if (!o) throw new HttpError(404, 'Order not found');
  if (o.stopId) throw new HttpError(409, 'Only unplaced orders can be split');
  const half = (n: number) => Math.round((n / 2) * 1000) / 1000;
  await db.transaction(async (tx) => {
    await tx.update(s.orders).set({ status: 'split' }).where(eq(s.orders.id, orderId));
    await tx.delete(s.deferrals).where(eq(s.deferrals.orderId, orderId));
    for (const part of ['A', 'B']) {
      await tx.insert(s.orders).values({
        ref: `${o.ref}-${part}`, outletId: o.outletId, depot: o.depot, brand: o.brand, temp: o.temp, units: part === 'A' ? Math.ceil(o.units / 2) : Math.floor(o.units / 2),
        weightKg: half(o.weightKg), volumeM3: half(o.volumeM3), deliveryDate: o.deliveryDate, source: o.source, deferredYesterday: o.deferredYesterday, daysSinceLastServed: o.daysSinceLastServed, parentRef: o.ref,
      }).onConflictDoNothing();
    }
  });
  return generatePlan(o.depot, o.deliveryDate);
}
