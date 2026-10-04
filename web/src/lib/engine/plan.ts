// Planning and allocation engine.
//
// Hard rules (every trip must satisfy all of them — the same rules as Datathon Task 2B, plus
// delivery windows and weekly fuel quotas from the Hackathon brief):
//   1. One brand and one district per trip.
//   2. Chilled orders only on refrigerated vehicles (reefers may also carry ambient orders).
//   3. van_only outlets only by vans.
//   4. A vehicle serves only outlets of its own depot, and only if it is not in the workshop.
//   5. Whole orders (an oversized order is deferred until the dispatcher splits it).
//   6. Trip load within both weight and volume limits.
//   7. At most two trips per vehicle per day. Trip time = outbound + inter-stop × (orders − 1)
//      + handling allowances. Fresh trips share a 270-min budget (03:30–08:00); Style/Tech trips
//      share a 480-min trading-day budget.
//   8. Every stop is reached before its delivery window closes (arriving early waits for opening).
//   9. The vehicle's fuel for the day fits inside what is left of its weekly quota.
//
// Allocation is a priority-ordered greedy insertion: orders that were deferred yesterday come
// first, then the longest-unserved outlets, then the hardest to carry (van-only, chilled), then
// the earliest window closes. Each order is placed
// where it adds the least time, preferring to keep refrigerated vehicles and vans for the orders
// that need them. Anything that cannot be placed is deferred with a diagnosed reason and a rank.
import { lateRisk as lateRiskModel } from './lateRisk';
import type { EngineInput, EOrder, EOutlet, EVehicle, PlannedStop, PlannedTrip, PlanResult, DeferredOrder, DeferReason, Violation } from './types';

export const FRESH_START = 3 * 60 + 30; // 03:30
export const FRESH_BUDGET = 270;
export const TRADING_START = 8 * 60; // 08:00 departure for Style / Tech
export const TRADING_BUDGET = 480;
export const RELOAD_MIN = 15;
export const MAX_TRIPS = 2;
export const DAY_END = 19 * 60;

export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fmt = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const r1 = (n: number) => Math.round(n * 10) / 10;

interface Draft { brand: string; district: string; orders: EOrder[] }

const isFresh = (brand: string) => brand === 'Fresh';

/** Rule-level checks for one order on one vehicle (rules 2, 3, 4). */
export function staticViolation(order: EOrder, outlet: EOutlet, v: EVehicle, depot: string): Violation | null {
  if (v.status !== 'available') return { code: 'UNAVAILABLE', message: `${v.id} is in the workshop` };
  if (v.depot !== outlet.depot || v.depot !== depot) return { code: 'DEPOT', message: `${v.id} is based at ${v.depot}; ${outlet.id} is served from ${outlet.depot}` };
  if (order.temp === 'chilled' && v.temp !== 'reefer') return { code: 'TEMPERATURE', message: `${order.ref} is chilled; ${v.id} is not refrigerated` };
  if (outlet.parkingConstraint === 'van_only' && v.type !== 'van') return { code: 'VAN_ONLY', message: `${outlet.id} is van-only; ${v.id} is a ${v.type}` };
  return null;
}

export class Engine {
  constructor(private ctx: EngineInput) {}

  outlet(id: string) { const o = this.ctx.outlets.get(id); if (!o) throw new Error(`Unknown outlet ${id}`); return o; }
  travel(district: string) { const t = this.ctx.travel.get(district); if (!t) throw new Error(`No travel data for ${district}`); return t; }
  allowance(brand: string, dock: string) { return this.ctx.service.get(`${brand}|${dock}`) ?? 30; }
  closeMin(outletId: string) { return toMin(this.outlet(outletId).windowClose) + (this.ctx.windowExtensions?.get(outletId) ?? 0); }

  speedFactor(district: string, minute: number) {
    const idx = this.ctx.speed?.get(`${district}|${Math.floor(minute / 60) % 24}|${this.ctx.monsoon ? 1 : 0}`);
    return idx ? 100 / idx : 1;
  }

  /** Official trip minutes (Task 2B formula): outbound + inter-stop × (orders − 1) + Σ handling. */
  tripMinutes(d: Draft) {
    const t = this.travel(d.district);
    const handling = d.orders.reduce((s, o) => s + this.allowance(d.brand, this.outlet(o.outletId).dockType), 0);
    return t.depotToDistrictMin + t.interStopMin * Math.max(0, d.orders.length - 1) + handling;
  }

  /** Lays a draft out in time from `earliest`; returns the trip or the first violated rule. */
  layout(v: EVehicle, d: Draft, earliest: number, tripNo: number): { trip?: PlannedTrip; violation?: Violation } {
    const t = this.travel(d.district);
    const loadKg = d.orders.reduce((s, o) => s + o.weightKg, 0);
    const loadM3 = d.orders.reduce((s, o) => s + o.volumeM3, 0);
    if (loadKg > v.weightCapKg + 1e-6) return { violation: { code: 'WEIGHT', message: `${r1(loadKg)} kg exceeds ${v.id}'s ${v.weightCapKg} kg` } };
    if (loadM3 > v.volumeCapM3 + 1e-6) return { violation: { code: 'VOLUME', message: `${r1(loadM3)} m³ exceeds ${v.id}'s ${v.volumeCapM3} m³` } };

    // Group orders into stops (one stop per outlet), earliest-closing window first.
    const byOutlet = new Map<string, EOrder[]>();
    for (const o of d.orders) byOutlet.set(o.outletId, [...(byOutlet.get(o.outletId) ?? []), o]);
    const stopOutlets = [...byOutlet.keys()].sort((a, b) => this.closeMin(a) - this.closeMin(b) || toMin(this.outlet(a).windowOpen) - toMin(this.outlet(b).windowOpen));

    const firstOpen = toMin(this.outlet(stopOutlets[0]).windowOpen);
    const start = Math.max(earliest, firstOpen - t.depotToDistrictMin);
    let clock = start + t.depotToDistrictMin;
    let pclock = start + t.depotToDistrictMin * this.speedFactor(d.district, start);
    const stops: PlannedStop[] = [];
    for (let i = 0; i < stopOutlets.length; i++) {
      const oid = stopOutlets[i];
      const out = this.outlet(oid);
      const os = byOutlet.get(oid)!;
      if (i > 0) { clock += t.interStopMin; pclock += t.interStopMin * this.speedFactor(d.district, pclock); }
      const open = toMin(out.windowOpen), close = this.closeMin(oid);
      if (clock > close) return { violation: { code: 'WINDOW', message: `${oid} would be reached at ${fmt(clock)}, after its window closes at ${fmt(close)}` } };
      const svcStart = Math.max(clock, open);
      const handling = os.length * this.allowance(d.brand, out.dockType);
      const units = os.reduce((s, o) => s + o.units, 0);
      // Predicted service time: the allowance, adjusted for order size (placeholder until the Datathon model is wired in).
      const predService = handling * (0.9 + 0.25 * Math.min(1, units / 250));
      // Minutes to spare at the planned (free-flow) ETA, mapped through the model fitted on history.
      const lateRisk = lateRiskModel(close - clock, !!this.ctx.monsoon);
      stops.push({ outletId: oid, orderIds: os.map((o) => o.id), etaMin: Math.round(clock), serviceStartMin: Math.round(svcStart), handlingMin: handling, predServiceMin: r1(predService), predArrivalMin: Math.round(pclock), lateRisk: Math.round(lateRisk * 100) / 100 });
      clock = svcStart + handling;
      pclock = Math.max(pclock, open) + predService;
    }
    const end = clock + t.depotToDistrictMin; // back at the depot
    if (end > DAY_END) return { violation: { code: 'WINDOW', message: `${v.id} would return at ${fmt(end)}, after the operating day` } };
    const km = 2 * t.depotToDistrictKm + t.interStopKm * Math.max(0, stopOutlets.length - 1);
    return {
      trip: {
        vehicleId: v.id, tripNo, brand: d.brand, district: d.district, carriesChilled: d.orders.some((o) => o.temp === 'chilled'),
        startMin: Math.round(start), endMin: Math.round(end), tripMinutes: Math.round(this.tripMinutes(d)), km: r1(km), fuelL: r1(km / v.kmPerL),
        loadKg: r1(loadKg), loadM3: Math.round(loadM3 * 1000) / 1000, stops,
      },
    };
  }

  /** Schedules all of a vehicle's drafts for the day (Fresh first, then trading-day trips). */
  scheduleVehicle(v: EVehicle, drafts: Draft[]): { trips?: PlannedTrip[]; violation?: Violation } {
    if (drafts.length > MAX_TRIPS) return { violation: { code: 'TRIPS', message: `${v.id} would need ${drafts.length} trips; the limit is ${MAX_TRIPS}` } };
    const ordered = [...drafts].sort((a, b) => Number(isFresh(b.brand)) - Number(isFresh(a.brand)));
    const trips: PlannedTrip[] = [];
    let freshMin = 0, tradeMin = 0, fuel = 0, prevEnd = 0;
    for (let i = 0; i < ordered.length; i++) {
      const d = ordered[i];
      const earliest = Math.max(isFresh(d.brand) ? FRESH_START : TRADING_START, prevEnd ? prevEnd + RELOAD_MIN : 0);
      const { trip, violation } = this.layout(v, d, earliest, i + 1);
      if (!trip) return { violation };
      if (isFresh(d.brand)) freshMin += trip.tripMinutes; else tradeMin += trip.tripMinutes;
      fuel += trip.fuelL;
      prevEnd = trip.endMin;
      trips.push(trip);
    }
    if (freshMin > FRESH_BUDGET) return { violation: { code: 'BUDGET', message: `${v.id}'s Fresh trips need ${freshMin} min; the budget is ${FRESH_BUDGET}` } };
    if (tradeMin > TRADING_BUDGET) return { violation: { code: 'BUDGET', message: `${v.id}'s Style/Tech trips need ${tradeMin} min; the budget is ${TRADING_BUDGET}` } };
    const left = v.weeklyFuelQuotaL - v.fuelUsedWeekL;
    if (fuel > left + 1e-6) return { violation: { code: 'FUEL', message: `${v.id} needs ${r1(fuel)} L; only ${r1(left)} L of its weekly quota is left` } };
    return { trips };
  }

  /** Within a fairness tier, orders with fewer vehicles that can carry them go first. */
  scarcity(o: EOrder) {
    const van = this.outlet(o.outletId).parkingConstraint === 'van_only';
    return (van ? 2 : 0) + (o.temp === 'chilled' ? 1 : 0);
  }

  sortOrders(orders: EOrder[]) {
    return [...orders].sort((a, b) =>
      Number(b.deferredYesterday) - Number(a.deferredYesterday)
      || b.daysSinceLastServed - a.daysSinceLastServed
      || this.scarcity(b) - this.scarcity(a)
      || this.closeMin(a.outletId) - this.closeMin(b.outletId)
      || b.volumeM3 - a.volumeM3
      || a.ref.localeCompare(b.ref));
  }

  /** Finds the cheapest feasible placement for one order given the current drafts. */
  bestPlacement(order: EOrder, vehicles: EVehicle[], drafts: Map<string, Draft[]>, failures: Violation[]) {
    const out = this.outlet(order.outletId);
    let best: { vid: string; drafts: Draft[]; cost: number } | null = null;
    for (const v of vehicles) {
      const sv = staticViolation(order, out, v, this.ctx.depot);
      if (sv) { failures.push(sv); continue; }
      const current = drafts.get(v.id) ?? [];
      const before = current.reduce((s, d) => s + this.tripMinutes(d), 0);
      // a) join an existing trip of the same brand and district
      current.forEach((d, i) => {
        if (d.brand !== out.brand || d.district !== out.district) return;
        const next = current.map((x, j) => (j === i ? { ...x, orders: [...x.orders, order] } : x));
        const res = this.scheduleVehicle(v, next);
        if (!res.trips) { failures.push(res.violation!); return; }
        const cost = next.reduce((s, x) => s + this.tripMinutes(x), 0) - before;
        if (!best || cost < best.cost) best = { vid: v.id, drafts: next, cost };
      });
      // b) open a new trip
      if (current.length < MAX_TRIPS) {
        const next = [...current, { brand: out.brand, district: out.district, orders: [order] }];
        const res = this.scheduleVehicle(v, next);
        if (!res.trips) { failures.push(res.violation ?? { code: 'TRIPS', message: '' }); continue; }
        let cost = this.tripMinutes(next[next.length - 1]) + 60 + current.length * 30 - v.volumeCapM3 * 1.5;
        if (v.temp === 'reefer' && order.temp !== 'chilled') cost += 400; // keep reefers for chilled goods
        if (v.type === 'van' && out.parkingConstraint !== 'van_only') cost += 300; // keep vans for van-only streets
        if (!best || cost < best.cost) best = { vid: v.id, drafts: next, cost };
      } else failures.push({ code: 'TRIPS', message: `${v.id} already has two trips` });
    }
    return best as { vid: string; drafts: Draft[]; cost: number } | null;
  }

  diagnose(order: EOrder, vehicles: EVehicle[], failures: Violation[]): { reason: DeferReason; text: string } {
    const out = this.outlet(order.outletId);
    const usable = vehicles.filter((v) => !staticViolation(order, out, v, this.ctx.depot));
    if (usable.length && usable.every((v) => order.volumeM3 > v.volumeCapM3 || order.weightKg > v.weightCapKg)) {
      const maxV = Math.max(...usable.map((v) => v.volumeCapM3));
      return { reason: 'OVERSIZE', text: `${r1(order.volumeM3)} m³ is larger than any available vehicle (max ${maxV} m³). Split it into two loads.` };
    }
    if (order.temp === 'chilled') return { reason: 'REEFER_CAPACITY', text: `No working refrigerated vehicle has room or time left before the window closes.` };
    if (out.parkingConstraint === 'van_only') return { reason: 'VAN_CAPACITY', text: `Van-only outlet and no van has room or time left.` };
    const counts = failures.reduce<Record<string, number>>((m, f) => ((m[f.code] = (m[f.code] ?? 0) + 1), m), {});
    if ((counts.FUEL ?? 0) > (counts.WINDOW ?? 0) && (counts.FUEL ?? 0) > (counts.VOLUME ?? 0)) return { reason: 'FUEL', text: 'Vehicles that could take it have used their weekly fuel quota.' };
    if ((counts.WINDOW ?? 0) + (counts.BUDGET ?? 0) > (counts.VOLUME ?? 0) + (counts.WEIGHT ?? 0)) return { reason: 'WINDOW', text: `No vehicle can reach ${out.id} before ${out.windowClose}.` };
    return { reason: 'FLEET_CAPACITY', text: 'All suitable vehicles are full or on their second trip.' };
  }

  plan(): PlanResult {
    const { ctx } = this;
    const vehicles = ctx.vehicles.filter((v) => v.depot === ctx.depot);
    const available = vehicles.filter((v) => v.status === 'available');
    const drafts = new Map<string, Draft[]>();
    const deferredRaw: { order: EOrder; reason: DeferReason; text: string }[] = [];
    const orders = this.sortOrders(ctx.orders.filter((o) => this.outlet(o.outletId).depot === ctx.depot));

    for (const order of orders) {
      const failures: Violation[] = [];
      const best = this.bestPlacement(order, available, drafts, failures);
      if (best) drafts.set(best.vid, best.drafts);
      else deferredRaw.push({ order, ...this.diagnose(order, available, failures) });
    }

    // Repair pass: a deferred chilled order may take the place of an ambient order on a reefer
    // trip to the same brand and district, if that ambient order can move to an ambient vehicle.
    const ambientFleet = available.filter((v) => v.temp !== 'reefer');
    for (const d of [...deferredRaw]) {
      if (d.order.temp !== 'chilled' || d.reason === 'OVERSIZE') continue;
      const out = this.outlet(d.order.outletId);
      let done = false;
      for (const v of available.filter((x) => x.temp === 'reefer') ) {
        if (done || staticViolation(d.order, out, v, ctx.depot)) continue;
        const current = drafts.get(v.id) ?? [];
        for (let i = 0; i < current.length && !done; i++) {
          const draft = current[i];
          if (draft.brand !== out.brand || draft.district !== out.district) continue;
          for (const amb of draft.orders.filter((o) => o.temp === 'ambient')) {
            const without = current.map((x, j) => (j === i ? { ...x, orders: x.orders.filter((o) => o.id !== amb.id) } : x));
            const withChilled = without.map((x, j) => (j === i ? { ...x, orders: [...x.orders, d.order] } : x));
            if (!this.scheduleVehicle(v, withChilled).trips) continue;
            const trial = new Map(drafts);
            trial.set(v.id, withChilled);
            const move = this.bestPlacement(amb, ambientFleet, trial, []);
            if (!move) continue;
            trial.set(move.vid, move.drafts);
            drafts.clear();
            for (const [k, val] of trial) drafts.set(k, val);
            deferredRaw.splice(deferredRaw.indexOf(d), 1);
            done = true;
            break;
          }
        }
      }
    }

    // Final schedule per vehicle (trip numbers in time order).
    const trips: PlannedTrip[] = [];
    for (const v of available) {
      const ds = drafts.get(v.id);
      if (!ds?.length) continue;
      const res = this.scheduleVehicle(v, ds);
      if (!res.trips) throw new Error(`Internal: ${v.id} schedule became infeasible: ${res.violation?.message}`);
      trips.push(...res.trips);
    }

    // Rank deferrals by the same priority rule, and look for a recovery the dispatcher can ask
    // the store for: a later window close (up to 30 min) that would let an existing vehicle serve it.
    const deferred: DeferredOrder[] = deferredRaw.map((d, i) => ({ orderId: d.order.id, reason: d.reason, reasonText: d.text, rank: i + 1 }));
    for (const d of deferred) {
      const raw = deferredRaw.find((x) => x.order.id === d.orderId)!;
      if (raw.reason === 'OVERSIZE') continue;
      const ext = new Map(ctx.windowExtensions ?? []);
      ext.set(raw.order.outletId, 30);
      const relaxed = new Engine({ ...ctx, windowExtensions: ext });
      const best = relaxed.bestPlacement(raw.order, available, drafts, []);
      if (best) {
        const res = relaxed.scheduleVehicle(available.find((v) => v.id === best.vid)!, best.drafts)!;
        const trip = res.trips?.find((t) => t.stops.some((s) => s.orderIds.includes(raw.order.id)));
        const stop = trip?.stops.find((s) => s.orderIds.includes(raw.order.id));
        if (trip && stop) {
          const close = toMin(this.outlet(raw.order.outletId).windowClose);
          const extra = Math.max(10, Math.ceil((stop.etaMin + 10 - close) / 5) * 5);
          if (extra <= 30) d.suggestion = { kind: 'extend_window', vehicleId: best.vid, tripNo: trip.tripNo, newCloseMin: close + extra, extraMin: extra };
        }
      }
    }

    const placedIds = new Set(trips.flatMap((t) => t.stops.flatMap((s) => s.orderIds)));
    const sum = (os: EOrder[], f: (o: EOrder) => number) => r1(os.reduce((s, o) => s + f(o), 0));
    const chilled = orders.filter((o) => o.temp === 'chilled');
    return {
      trips: trips.sort((a, b) => a.vehicleId.localeCompare(b.vehicleId) || a.tripNo - b.tripNo),
      deferred,
      stats: {
        orders: orders.length,
        placed: placedIds.size,
        deferred: deferred.length,
        volumeM3: sum(orders, (o) => o.volumeM3),
        placedVolumeM3: sum(orders.filter((o) => placedIds.has(o.id)), (o) => o.volumeM3),
        chilledM3: sum(chilled, (o) => o.volumeM3),
        chilledPlacedM3: sum(chilled.filter((o) => placedIds.has(o.id)), (o) => o.volumeM3),
        reeferCapacityPerWaveM3: r1(available.filter((v) => v.temp === 'reefer').reduce((s, v) => s + v.volumeCapM3, 0)),
        vehiclesAvailable: available.length,
        vehiclesUsed: new Set(trips.map((t) => t.vehicleId)).size,
        lockedPlaced: orders.filter((o) => o.deferredYesterday && placedIds.has(o.id)).length,
        lockedTotal: orders.filter((o) => o.deferredYesterday).length,
        lateRiskStops: trips.reduce((s, t) => s + t.stops.filter((x) => x.lateRisk > 0.3).length, 0),
      },
    };
  }

  /**
   * Re-homes orders after a vehicle drops out of a published plan (e.g. a breakdown). The other
   * vehicles keep their existing trips; each displaced order, in priority order, goes to the
   * cheapest spot that still passes every rule. Orders that fit nowhere come back with the rule
   * that blocked them. `drafts` holds the current trips of the vehicles allowed to take orders.
   */
  reassign(orders: EOrder[], vehicles: EVehicle[], drafts: Map<string, Draft[]>) {
    const next = new Map(drafts);
    const placed: { orderId: string; vehicleId: string }[] = [];
    const unplaced: { order: EOrder; reason: DeferReason; text: string }[] = [];
    for (const order of this.sortOrders(orders)) {
      const failures: Violation[] = [];
      const best = this.bestPlacement(order, vehicles, next, failures);
      if (best) { next.set(best.vid, best.drafts); placed.push({ orderId: order.id, vehicleId: best.vid }); }
      else unplaced.push({ order, ...this.diagnose(order, vehicles, failures) });
    }
    return { drafts: next, placed, unplaced };
  }

  /** Validates a manually edited trip (used when the dispatcher moves or places an order). */
  validate(v: EVehicle, allDrafts: Draft[]): Violation[] {
    const violations: Violation[] = [];
    for (const d of allDrafts) for (const o of d.orders) {
      const out = this.outlet(o.outletId);
      const sv = staticViolation(o, out, v, this.ctx.depot);
      if (sv) violations.push(sv);
      if (out.brand !== d.brand || out.district !== d.district) violations.push({ code: 'BRAND_DISTRICT', message: `${o.ref} (${out.brand}, ${out.district}) cannot share a ${d.brand} trip to ${d.district}` });
    }
    if (violations.length) return violations;
    const res = this.scheduleVehicle(v, allDrafts);
    return res.violation ? [res.violation] : [];
  }
}

export function planDay(input: EngineInput): PlanResult {
  return new Engine(input).plan();
}

export type { Draft };
