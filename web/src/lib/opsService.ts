// Field and store operations: loader departures, driver runs, store view, live board, and the
// offline sync endpoint that applies queued events exactly once.
import { and, eq, inArray, asc, desc, sql } from 'drizzle-orm';
import { db, schema as s } from '@/db';
import { HttpError, DEMO_MODE, type Session } from './auth';
import { DEMO_DATE, prettyDate } from './time';
import { expectedArrival } from './engine/arrivalDelay';
import { nextOperatingDay } from './planService';

const OFFLINE_AFTER_MS = 90_000; // a departed vehicle with no record for 90 s shows as offline

async function publishedTrips(where: { depot?: string; vehicleId?: string; tripIds?: string[] }, date = DEMO_DATE) {
  const plans = await db.select().from(s.plans).where(and(eq(s.plans.date, date), eq(s.plans.status, 'published'), where.depot ? eq(s.plans.depot, where.depot) : undefined));
  if (!plans.length) return [];
  const trips = await db.select().from(s.trips).where(and(inArray(s.trips.planId, plans.map((p) => p.id)), where.vehicleId ? eq(s.trips.vehicleId, where.vehicleId) : undefined, where.tripIds ? inArray(s.trips.id, where.tripIds) : undefined)).orderBy(asc(s.trips.startMin));
  if (!trips.length) return [];
  const [stops, vehicles, outlets, flags] = await Promise.all([
    db.select().from(s.stops).where(inArray(s.stops.tripId, trips.map((t) => t.id))).orderBy(asc(s.stops.seq)),
    db.select().from(s.vehicles), db.select().from(s.outlets),
    db.select().from(s.loadFlags).where(inArray(s.loadFlags.tripId, trips.map((t) => t.id))),
  ]);
  const orders = stops.length ? await db.select().from(s.orders).where(inArray(s.orders.stopId, stops.map((x) => x.id))) : [];
  const receipts = stops.length ? await db.select().from(s.receipts).where(inArray(s.receipts.stopId, stops.map((x) => x.id))) : [];
  return trips.map((t) => ({
    ...t,
    depot: plans.find((p) => p.id === t.planId)!.depot,
    vehicle: vehicles.find((v) => v.id === t.vehicleId)!,
    flags: flags.filter((f) => f.tripId === t.id),
    stops: stops.filter((x) => x.tripId === t.id).map((x) => {
      const os = orders.filter((o) => o.stopId === x.id);
      const shortBy = flags.filter((f) => f.stopId === x.id && !f.resolved).reduce((a, f) => a + f.qty, 0);
      return {
        ...x, outlet: outlets.find((o) => o.id === x.outletId)!, orders: os,
        units: os.reduce((a, o) => a + o.units, 0), chilledUnits: os.filter((o) => o.temp === 'chilled').reduce((a, o) => a + o.units, 0),
        volumeM3: Math.round(os.reduce((a, o) => a + o.volumeM3, 0) * 100) / 100, weightKg: Math.round(os.reduce((a, o) => a + o.weightKg, 0)),
        expectedUnits: os.reduce((a, o) => a + o.units, 0) - shortBy, shortBy,
        receipt: receipts.find((r) => r.stopId === x.id) ?? null,
      };
    }),
    isOffline: t.status === 'departed' && (!t.lastSyncAt || Date.now() - new Date(t.lastSyncAt).getTime() > OFFLINE_AFTER_MS),
  }));
}
export type TripView = Awaited<ReturnType<typeof publishedTrips>>[number];

// ---------- Loader ----------
export async function loaderDepartures(depot: string) {
  const trips = await publishedTrips({ depot });
  const notes = await db.select().from(s.notifications).where(eq(s.notifications.audience, `LOADER:${depot}`)).orderBy(desc(s.notifications.createdAt)).limit(3);
  return { depot, date: DEMO_DATE, trips, notes };
}
export async function loaderTrip(id: string, session?: Session) {
  const [t] = await publishedTrips({ tripIds: [id] });
  if (!t) throw new HttpError(404, 'Trip not found or not published');
  if (session) { try { await assertOwnTrip(session, id); } catch { throw new HttpError(404, 'Trip not found or not published'); } }
  return t;
}

// ---------- Driver ----------
export async function driverRun(session: Session, vehicleId?: string | null) {
  const all = await publishedTrips({});
  const vehicles = [...new Set(all.map((t) => t.vehicleId))].sort();
  let vid = vehicleId || session.vehicleId || null;
  if (!DEMO_MODE) vid = session.vehicleId;
  else if (!vid || !vehicles.includes(vid)) {
    // Default: the vehicle that serves the demo store manager's outlet, so the walkthrough connects.
    const store = (await db.select().from(s.users).where(eq(s.users.role, 'STORE_MANAGER')))[0];
    vid = all.find((t) => t.stops.some((x) => x.outletId === store?.outletId))?.vehicleId ?? vehicles[0] ?? null;
  }
  return { date: DEMO_DATE, vehicleId: vid, vehicles: DEMO_MODE ? vehicles : vehicles.filter((v) => v === vid), demo: DEMO_MODE, trips: all.filter((t) => t.vehicleId === vid), serverTime: new Date().toISOString() };
}

// ---------- Store manager ----------
export async function storeOverview(outletId: string) {
  const outlet = (await db.select().from(s.outlets).where(eq(s.outlets.id, outletId)))[0];
  if (!outlet) throw new HttpError(404, 'Outlet not found');
  const nextDate = await nextOperatingDay(DEMO_DATE);
  const orders = await db.select().from(s.orders).where(and(eq(s.orders.outletId, outletId), sql`${s.orders.deliveryDate} >= ${DEMO_DATE}`)).orderBy(asc(s.orders.createdAt));
  const stopIds = [...new Set(orders.map((o) => o.stopId).filter(Boolean))] as string[];
  const stopRows = stopIds.length ? await db.select().from(s.stops).where(inArray(s.stops.id, stopIds)) : [];
  const trips = stopRows.length ? await publishedTrips({ tripIds: [...new Set(stopRows.map((x) => x.tripId))] }) : [];
  const monsoon = !!(await db.select().from(s.calendarDays).where(eq(s.calendarDays.date, DEMO_DATE)))[0]?.monsoon;
  const deliveries = trips.map((t) => {
    const stop = t.stops.find((x) => x.outletId === outletId)!;
    const done = t.stops.filter((x) => x.status !== 'pending').length;
    return { trip: { id: t.id, vehicleId: t.vehicleId, tripNo: t.tripNo, status: t.status, startMin: t.startMin, sealedAt: t.sealedAt, departedAt: t.departedAt, lastSyncAt: t.lastSyncAt, isOffline: t.isOffline, stopsTotal: t.stops.length, stopsDone: done, flags: t.flags.filter((f) => f.stopId === stop.id) }, stop , arrival: expectedArrival(stop.etaMin, stop.seq, monsoon) };
  });
  const notes = await db.select().from(s.notifications).where(eq(s.notifications.audience, `OUTLET:${outletId}`)).orderBy(desc(s.notifications.createdAt));
  const outlets = await db.select({ id: s.outlets.id, brand: s.outlets.brand, district: s.outlets.district }).from(s.outlets).orderBy(asc(s.outlets.id));
  return { outlet, date: DEMO_DATE, nextDate, orders, deliveries, notes, outlets: DEMO_MODE ? outlets : outlets.filter((o) => o.id === outletId), demo: DEMO_MODE, cutoff: '16:00' };
}

type Item = { brand: 'Fresh' | 'Style' | 'Tech'; name: string; pack: string; temp: 'chilled' | 'ambient'; kg: number; m3: number };
// What each brand's stores order (illustrative products; the datasets only have order totals).
// Style and Tech pack sizes are set so typical orders match the history: a Style order is about
// 8 m³ of light, bulky garments; a Tech order is a few heavy appliances.
const CATALOGUE: Record<string, Item> = {
  milk: { brand: 'Fresh', name: 'Fresh milk 1 L', pack: 'Crate of 12', temp: 'chilled', kg: 13.2, m3: 0.03 },
  yoghurt: { brand: 'Fresh', name: 'Yoghurt 80 g', pack: 'Carton of 24', temp: 'chilled', kg: 2.2, m3: 0.006 },
  cheese: { brand: 'Fresh', name: 'Cheese slices', pack: 'Case', temp: 'chilled', kg: 4.5, m3: 0.012 },
  butter: { brand: 'Fresh', name: 'Butter 200 g', pack: 'Case of 20', temp: 'chilled', kg: 4.2, m3: 0.01 },
  rice: { brand: 'Fresh', name: 'Rice 5 kg', pack: 'Bag', temp: 'ambient', kg: 5, m3: 0.008 },
  flour: { brand: 'Fresh', name: 'Wheat flour 1 kg', pack: 'Case of 10', temp: 'ambient', kg: 10.4, m3: 0.015 },
  tea: { brand: 'Fresh', name: 'Tea 400 g', pack: 'Case of 12', temp: 'ambient', kg: 5.2, m3: 0.012 },
  biscuits: { brand: 'Fresh', name: 'Biscuits', pack: 'Case of 24', temp: 'ambient', kg: 4.8, m3: 0.02 },
  folded: { brand: 'Style', name: 'Folded garments', pack: 'Carton of 20', temp: 'ambient', kg: 12, m3: 0.2 },
  hanging: { brand: 'Style', name: 'Hanging garments', pack: 'Rail of 30', temp: 'ambient', kg: 18, m3: 0.35 },
  footwear: { brand: 'Style', name: 'Footwear', pack: 'Carton of 12 pairs', temp: 'ambient', kg: 10, m3: 0.12 },
  fridge: { brand: 'Tech', name: 'Double-door refrigerator', pack: 'Boxed, 1 unit', temp: 'ambient', kg: 140, m3: 1.1 },
  washer: { brand: 'Tech', name: 'Washing machine', pack: 'Boxed, 1 unit', temp: 'ambient', kg: 90, m3: 0.75 },
  tv: { brand: 'Tech', name: '65-inch television', pack: 'Boxed, 1 unit', temp: 'ambient', kg: 45, m3: 0.5 },
  aircon: { brand: 'Tech', name: 'Inverter air conditioner', pack: 'Indoor + outdoor set', temp: 'ambient', kg: 75, m3: 0.6 },
};

/**
 * When a new order from this outlet is delivered, following its brand's schedule (booklet p.3):
 * Fresh and Tech go on the next run; Style goes on the outlet's weekly delivery day.
 */
async function nextDeliveryFor(outlet: typeof s.outlets.$inferSelect) {
  if (outlet.brand === 'Style' && outlet.deliveryWeekday) {
    const days = await db.select().from(s.calendarDays).where(and(sql`${s.calendarDays.date} > ${DEMO_DATE}`, eq(s.calendarDays.isOperating, true), eq(s.calendarDays.dowName, outlet.deliveryWeekday.slice(0, 3)))).orderBy(asc(s.calendarDays.date)).limit(1);
    if (days[0]) return { date: days[0].date, kind: 'weekly' as const, weekday: outlet.deliveryWeekday };
  }
  return { date: await nextOperatingDay(DEMO_DATE), kind: outlet.brand === 'Tech' ? ('as_needed' as const) : ('daily' as const), weekday: null };
}

/** The order form for one outlet: its brand's products and when the order would be delivered. */
export async function orderForm(outletId: string) {
  const outlet = (await db.select().from(s.outlets).where(eq(s.outlets.id, outletId)))[0];
  if (!outlet) throw new HttpError(404, 'Outlet not found');
  const items = Object.fromEntries(Object.entries(CATALOGUE).filter(([, v]) => v.brand === outlet.brand));
  return { outletId, brand: outlet.brand, items, delivery: await nextDeliveryFor(outlet) };
}

export async function placeStoreOrder(outletId: string, lines: { sku: string; qty: number }[]) {
  const outlet = (await db.select().from(s.outlets).where(eq(s.outlets.id, outletId)))[0];
  if (!outlet) throw new HttpError(404, 'Outlet not found');
  const valid = lines.filter((l) => CATALOGUE[l.sku]?.brand === outlet.brand && l.qty > 0);
  if (!valid.length) throw new HttpError(400, lines.some((l) => CATALOGUE[l.sku] && l.qty > 0) ? `${outlet.id} is a ${outlet.brand} store; those items are not on its order list` : 'Add at least one item');
  const { date } = await nextDeliveryFor(outlet);
  const created = [];
  for (const temp of ['chilled', 'ambient'] as const) {
    const ls = valid.filter((l) => CATALOGUE[l.sku].temp === temp);
    if (!ls.length) continue;
    if (temp === 'chilled' && outlet.brand !== 'Fresh') throw new HttpError(400, 'Only Fresh outlets order chilled goods');
    const ref = `WP-${date.slice(5).replace('-', '')}-${outletId.slice(3)}-${temp === 'chilled' ? 'C' : 'D'}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const [o] = await db.insert(s.orders).values({
      ref, outletId, depot: outlet.depot, brand: outlet.brand, temp, units: ls.reduce((a, l) => a + l.qty, 0),
      weightKg: Math.round(ls.reduce((a, l) => a + l.qty * CATALOGUE[l.sku].kg, 0) * 10) / 10,
      volumeM3: Math.round(ls.reduce((a, l) => a + l.qty * CATALOGUE[l.sku].m3, 0) * 1000) / 1000,
      deliveryDate: date, source: 'app', lines: ls,
    }).returning();
    created.push(o);
  }
  await db.insert(s.notifications).values({ audience: 'DISPATCHER', kind: 'order', title: `New order from ${outletId}`, body: `${created.map((o) => o.ref).join(', ')} for ${prettyDate(date)}` });
  return { created, deliveryDate: date };
}

export async function recordReceipt(outletId: string, stopId: string, body: { status: 'confirmed' | 'issue'; issueType?: string; qty?: number; note?: string; photo?: string }) {
  const stop = (await db.select().from(s.stops).where(eq(s.stops.id, stopId)))[0];
  if (!stop || stop.outletId !== outletId) throw new HttpError(404, 'Delivery not found');
  const flags = await db.select().from(s.loadFlags).where(eq(s.loadFlags.stopId, stopId));
  const match = body.status === 'issue' && ['missing', 'short', 'damaged'].includes(body.issueType ?? '') ? flags.find((f) => !f.resolved) : undefined;
  await db.insert(s.receipts).values({ stopId, status: body.status, issueType: body.issueType ?? null, qty: body.qty ?? null, note: body.note ?? null, photo: body.photo ?? null, matchedFlagId: match?.id ?? null })
    .onConflictDoUpdate({ target: s.receipts.stopId, set: { status: body.status, issueType: body.issueType ?? null, qty: body.qty ?? null, note: body.note ?? null, matchedFlagId: match?.id ?? null } });
  if (body.status === 'issue') {
    await db.insert(s.notifications).values({
      audience: 'DISPATCHER', kind: 'issue', refId: stopId, title: `${outletId} reported: ${body.issueType} × ${body.qty ?? '?'}`,
      body: match ? `Matches the loader's flag (${match.qty} × ${match.item}, ${match.issueType}) — not the driver's fault.` : (body.note || 'Check the driver’s proof of delivery.'),
    });
  }
  return { matched: !!match };
}

// ---------- Offline sync ----------
export interface SyncEventIn { id: string; kind: string; at: string; payload: Record<string, unknown> }

/** Outside demo mode, a driver may only touch their own vehicle's trips and a loader only their depot's. */
async function assertOwnTrip(session: Session, tripId: string | undefined) {
  if (DEMO_MODE || !tripId) return;
  const row = (await db.select({ vehicleId: s.trips.vehicleId, depot: s.plans.depot }).from(s.trips).innerJoin(s.plans, eq(s.trips.planId, s.plans.id)).where(eq(s.trips.id, tripId)))[0];
  if (!row) throw new Error('Trip not found');
  if (session.role === 'DRIVER' && row.vehicleId !== session.vehicleId) throw new Error('This trip is not on your vehicle');
  if (session.role === 'LOADER' && row.depot !== session.depot) throw new Error('This trip is not at your depot');
}

/** Applies queued field events exactly once (idempotent by client event id). */
export async function applyEvents(session: Session, events: SyncEventIn[]) {
  const results: { id: string; status: 'applied' | 'duplicate' | 'rejected'; message?: string; matched?: string }[] = [];
  for (const e of events.sort((a, b) => a.at.localeCompare(b.at))) {
    const seen = (await db.select().from(s.syncEvents).where(eq(s.syncEvents.id, e.id)))[0];
    if (seen) { results.push({ id: e.id, status: 'duplicate' }); continue; }
    let message: string | undefined; let matched: string | undefined; let ok = true;
    try {
      const p = e.payload as Record<string, never>;
      const at = new Date(e.at);
      const stopTrip = !p.tripId && p.stopId ? (await db.select({ tripId: s.stops.tripId }).from(s.stops).where(eq(s.stops.id, p.stopId)))[0]?.tripId : undefined;
      await assertOwnTrip(session, (p.tripId as string | undefined) ?? stopTrip);
      switch (e.kind) {
        case 'loader.check': {
          if (session.role !== 'LOADER') throw new Error('Only loaders can load');
          await db.update(s.stops).set({ loaded: !!p.loaded }).where(eq(s.stops.id, p.stopId));
          await db.update(s.trips).set({ status: 'loading' }).where(and(eq(s.trips.id, p.tripId), eq(s.trips.status, 'planned')));
          break;
        }
        case 'loader.flag': {
          if (session.role !== 'LOADER') throw new Error('Only loaders can flag');
          const stop = (await db.select().from(s.stops).where(eq(s.stops.id, p.stopId)))[0];
          await db.insert(s.loadFlags).values({ tripId: p.tripId, stopId: p.stopId, item: p.item, issueType: p.issueType, qty: Number(p.qty) || 1, note: p.note ?? null, photo: p.photo ?? null, createdBy: session.name, createdAt: at });
          await db.update(s.stops).set({ loaded: true }).where(eq(s.stops.id, p.stopId));
          const trip = (await db.select().from(s.trips).where(eq(s.trips.id, p.tripId)))[0];
          const label = `${p.qty} × ${p.item} ${String(p.issueType).replace('_', ' ')}`;
          await db.insert(s.notifications).values([
            { audience: `OUTLET:${stop.outletId}`, kind: 'flag', refId: p.stopId, title: `${label} at the dock`, body: `Found before ${trip.vehicleId} left. A replacement is offered on the next run; the driver's count is already corrected.` },
            { audience: 'DISPATCHER', kind: 'flag', refId: p.tripId, title: `Loader flag · ${trip.vehicleId} · ${stop.outletId}`, body: label + (p.note ? ` — ${p.note}` : '') },
          ]);
          break;
        }
        case 'loader.seal': {
          const stops = await db.select().from(s.stops).where(eq(s.stops.tripId, p.tripId));
          if (stops.some((x) => !x.loaded)) throw new Error('Every stop must be loaded or flagged before sealing');
          await db.update(s.trips).set({ status: 'sealed', sealedAt: at }).where(eq(s.trips.id, p.tripId));
          break;
        }
        case 'driver.depart': {
          await db.update(s.trips).set({ status: 'departed', departedAt: at, lastSyncAt: new Date() }).where(eq(s.trips.id, p.tripId));
          break;
        }
        case 'driver.heartbeat': {
          await db.update(s.trips).set({ lastSyncAt: new Date() }).where(eq(s.trips.id, p.tripId));
          break;
        }
        case 'driver.stop': {
          if (session.role !== 'DRIVER') throw new Error('Only drivers record stops');
          const stop = (await db.select().from(s.stops).where(eq(s.stops.id, p.stopId)))[0];
          if (!stop) throw new Error('Stop not found');
          // First completion to reach the server wins; a second record for the same stop is reported, not applied.
          if (stop.status !== 'pending') { results.push({ id: e.id, status: 'duplicate', message: `Stop ${stop.seq} was already recorded as ${stop.status}` }); await db.insert(s.syncEvents).values({ id: e.id, userId: session.userId, kind: e.kind, payload: e.payload, clientAt: new Date(e.at), result: 'duplicate' }).onConflictDoNothing(); continue; }
          const outcome = String(p.outcome);
          await db.update(s.stops).set({
            status: outcome, arrivedAt: p.arrivedAt ? new Date(p.arrivedAt) : at, completedAt: at, receiverName: p.receiverName ?? null,
            signature: p.signature ?? null, photo: p.photo ?? null, deliveredUnits: p.deliveredUnits ?? null, note: p.note ?? null, gps: p.gps ?? null,
            recordedOffline: !!p.offline, syncedAt: new Date(),
          }).where(eq(s.stops.id, p.stopId));
          const map: Record<string, string> = { delivered: 'delivered', partial: 'partial', refused: 'refused', no_access: 'failed' };
          await db.update(s.orders).set({ status: map[outcome] ?? 'delivered' }).where(eq(s.orders.stopId, p.stopId));
          await db.update(s.trips).set({ lastSyncAt: new Date(), status: 'departed' }).where(eq(s.trips.id, stop.tripId));
          const rec = (await db.select().from(s.receipts).where(eq(s.receipts.stopId, p.stopId)))[0];
          if (rec?.status === 'issue') matched = rec.matchedFlagId ? `The store reported "${rec.issueType} × ${rec.qty}" while you were offline. It matches the loader's flag, so there is nothing for you to do.` : `The store reported "${rec.issueType}". Your record and photo have been sent to the dispatcher.`;
          const remaining = (await db.select().from(s.stops).where(and(eq(s.stops.tripId, stop.tripId), eq(s.stops.status, 'pending')))).length;
          if (!remaining) await db.update(s.trips).set({ status: 'completed', completedAt: at }).where(eq(s.trips.id, stop.tripId));
          break;
        }
        default: throw new Error(`Unknown event ${e.kind}`);
      }
    } catch (err) { ok = false; message = (err as Error).message; }
    await db.insert(s.syncEvents).values({ id: e.id, userId: session.userId, kind: e.kind, payload: e.payload, clientAt: new Date(e.at), result: ok ? 'applied' : `rejected: ${message}` }).onConflictDoNothing();
    results.push({ id: e.id, status: ok ? 'applied' : 'rejected', message, matched });
  }
  return { results, serverTime: new Date().toISOString() };
}

// ---------- Live board ----------
export async function liveBoard(depot?: string) {
  const trips = await publishedTrips(depot ? { depot } : {});
  const notes = await db.select().from(s.notifications).where(eq(s.notifications.audience, 'DISPATCHER')).orderBy(desc(s.notifications.createdAt)).limit(30);
  const pendingRequests = await db.select().from(s.deferrals).where(eq(s.deferrals.status, 'requested'));
  const stopsAll = trips.flatMap((t) => t.stops);
  const exceptions = [
    ...trips.filter((t) => t.isOffline).map((t) => {
      const done = t.stops.filter((x) => x.status !== 'pending');
      const next = t.stops.find((x) => x.status === 'pending');
      return { kind: 'offline', rank: 2, title: `${t.vehicleId} · ${t.district}`, at: t.lastSyncAt, body: `No signal since ${t.lastSyncAt ? new Date(t.lastSyncAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' }) : 'departure'}. Last record: stop ${done.length} of ${t.stops.length}. Predicted next: ${next?.outletId ?? 'return to depot'}. Records are saving on the driver's phone.`, tripId: t.id };
    }),
    ...trips.filter((t) => t.status === 'departed' && !t.isOffline).flatMap((t) => t.stops.filter((x) => x.status === 'pending' && x.lateRisk > 0.3).map((x) => ({ kind: 'late', rank: 1, title: `${t.vehicleId} → ${x.outletId}`, at: null, body: `Late risk ${Math.round(x.lateRisk * 100)}%: planned ${String(Math.floor(x.etaMin / 60)).padStart(2, '0')}:${String(x.etaMin % 60).padStart(2, '0')}, window closes ${x.outlet.windowClose}.`, tripId: t.id }))),
    ...notes.filter((n) => ['flag', 'issue', 'store_reply', 'breakdown'].includes(n.kind)).map((n) => ({ kind: n.kind, rank: n.kind === 'issue' || n.kind === 'breakdown' ? 1 : 3, title: n.title, at: n.createdAt, body: n.body, tripId: null })),
    ...pendingRequests.map((d) => ({ kind: 'awaiting', rank: 4, title: 'Waiting for a store reply', at: d.decidedAt, body: `Asked the store to accept a later window for order ${d.orderId.slice(0, 8)}.`, tripId: null })),
  ].sort((a, b) => a.rank - b.rank);
  return {
    date: DEMO_DATE,
    kpis: {
      vehiclesOut: new Set(trips.filter((t) => ['departed', 'completed'].includes(t.status)).map((t) => t.vehicleId)).size,
      trips: trips.length,
      stopsDone: stopsAll.filter((x) => x.status !== 'pending').length,
      stopsTotal: stopsAll.length,
      lateRisk: trips.filter((t) => t.status !== 'completed').reduce((a, t) => a + t.stops.filter((x) => x.status === 'pending' && x.lateRisk > 0.3).length, 0),
      offline: trips.filter((t) => t.isOffline).length,
      sealed: trips.filter((t) => t.status !== 'planned' && t.status !== 'loading').length,
    },
    trips, exceptions,
  };
}

// ---------- Forecast ----------
export async function forecast(depot: string) {
  const weeks = await db.select().from(s.forecastWeeks).where(eq(s.forecastWeeks.depot, depot)).orderBy(asc(s.forecastWeeks.isoWeek));
  const vehicles = await db.select().from(s.vehicles).where(and(eq(s.vehicles.depot, depot), eq(s.vehicles.temp, 'reefer')));
  const cal = await db.select().from(s.calendarDays).where(sql`${s.calendarDays.isoYear} = 2026`);
  const demoWeek = cal.find((c) => c.date === DEMO_DATE)?.isoWeek;
  const fullCap = vehicles.reduce((a, v) => a + v.volumeCapM3, 0);
  const nowCap = vehicles.filter((v) => v.status === 'available').reduce((a, v) => a + v.volumeCapM3, 0);
  const rows = weeks.map((w) => {
    const days = cal.filter((c) => c.isoWeek === w.isoWeek && c.isOperating);
    const cap = (w.isoWeek === demoWeek ? nowCap : fullCap) * days.length;
    const firstDay = cal.filter((c) => c.isoWeek === w.isoWeek).sort((a, b) => a.date.localeCompare(b.date))[0];
    const events = [...new Set(cal.filter((c) => c.isoWeek === w.isoWeek && (c.festival || c.festivalRamp > 0.5 || c.isHoliday)).map((c) => c.festival ?? (c.isHoliday ? 'holiday' : 'festival ramp')))];
    return { week: w.isoWeek, start: firstDay?.date, totalM3: w.totalM3, chilledM3: w.chilledM3, operatingDays: days.length, reefersInService: w.isoWeek === demoWeek ? vehicles.filter((v) => v.status === 'available').length : vehicles.length, reeferCapM3: Math.round(cap), utilisation: cap ? w.chilledM3 / cap : 0, events };
  });
  return { depot, reefers: vehicles.length, rows, demoWeek, workshop: vehicles.filter((v) => v.status !== 'available').map((v) => ({ id: v.id, cap: v.volumeCapM3 })) };
}
