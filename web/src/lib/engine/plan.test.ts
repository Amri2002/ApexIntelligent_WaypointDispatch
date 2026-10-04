// Engine tests: every produced trip is checked by an independent rule checker written from the
// brief, so a bug in the engine's own checks cannot hide a broken plan.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { planDay, toMin, Engine } from './plan';
import { inputFromCsv } from './csv-input';
import type { EngineInput, PlanResult } from './types';

const DATA = path.resolve(__dirname, '../../../../data');

function independentCheck(input: EngineInput, res: PlanResult) {
  const errors: string[] = [];
  const orderById = new Map(input.orders.map((o) => [o.id, o]));
  const seen = new Set<string>();
  const perVehicle = new Map<string, typeof res.trips>();
  for (const t of res.trips) {
    const v = input.vehicles.find((x) => x.id === t.vehicleId)!;
    perVehicle.set(v.id, [...(perVehicle.get(v.id) ?? []), t]);
    if (v.status !== 'available') errors.push(`${v.id} in workshop`);
    let kg = 0, m3 = 0, n = 0, handling = 0;
    for (const s of t.stops) {
      const out = input.outlets.get(s.outletId)!;
      if (out.depot !== v.depot) errors.push(`${t.vehicleId} serves other depot`);
      if (out.brand !== t.brand || out.district !== t.district) errors.push(`${t.vehicleId}/${t.tripNo} mixes brand or district`);
      if (out.parkingConstraint === 'van_only' && v.type !== 'van') errors.push(`${out.id} van-only on ${v.type}`);
      if (s.etaMin > toMin(out.windowClose)) errors.push(`${out.id} late ${s.etaMin}`);
      for (const oid of s.orderIds) {
        const o = orderById.get(oid)!;
        if (seen.has(oid)) errors.push(`${oid} placed twice`);
        seen.add(oid);
        if (o.temp === 'chilled' && v.temp !== 'reefer') errors.push(`${oid} chilled on ambient`);
        kg += o.weightKg; m3 += o.volumeM3; n++;
        handling += input.service.get(`${t.brand}|${out.dockType}`)!;
      }
    }
    if (kg > v.weightCapKg + 1e-6 || m3 > v.volumeCapM3 + 1e-6) errors.push(`${t.vehicleId}/${t.tripNo} over capacity`);
    const tr = input.travel.get(t.district)!;
    const minutes = tr.depotToDistrictMin + tr.interStopMin * (n - 1) + handling;
    if (Math.abs(minutes - t.tripMinutes) > 1) errors.push(`${t.vehicleId}/${t.tripNo} trip minutes ${t.tripMinutes} != ${minutes}`);
  }
  for (const [vid, ts] of perVehicle) {
    if (ts.length > 2) errors.push(`${vid} has ${ts.length} trips`);
    const fresh = ts.filter((t) => t.brand === 'Fresh').reduce((s, t) => s + t.tripMinutes, 0);
    const trade = ts.filter((t) => t.brand !== 'Fresh').reduce((s, t) => s + t.tripMinutes, 0);
    if (fresh > 270) errors.push(`${vid} Fresh budget ${fresh}`);
    if (trade > 480) errors.push(`${vid} trading budget ${trade}`);
  }
  for (const d of res.deferred) {
    if (seen.has(d.orderId)) errors.push(`${d.orderId} both placed and deferred`);
    seen.add(d.orderId);
  }
  if (seen.size !== input.orders.length) errors.push(`accounted ${seen.size} of ${input.orders.length} orders`);
  return errors;
}

describe('planning engine on the demo day', () => {
  for (const depot of ['Peliyagoda', 'Kandy']) {
    it(`produces a feasible plan for ${depot}`, () => {
      const input = inputFromCsv(DATA, depot);
      const res = planDay(input);
      expect(independentCheck(input, res)).toEqual([]);
      expect(res.stats.placed).toBeGreaterThan(0);
      // eslint-disable-next-line no-console
      console.log(depot, JSON.stringify(res.stats), res.deferred.map((d) => `${d.orderId}:${d.reason}${d.suggestion ? '*' : ''}`).join(' '));
    });
  }

  it('places every order deferred yesterday on the S1 peak day', () => {
    const res = planDay(inputFromCsv(DATA, 'Peliyagoda'));
    expect(res.stats.lockedPlaced).toBe(res.stats.lockedTotal);
  });

  it('defers the order that is larger than any vehicle', () => {
    const res = planDay(inputFromCsv(DATA, 'Peliyagoda'));
    expect(res.deferred.find((d) => d.orderId === 'S1-078')?.reason).toBe('OVERSIZE');
  });

  it('rejects a chilled order moved onto an ambient truck', () => {
    const input = inputFromCsv(DATA, 'Peliyagoda');
    const e = new Engine(input);
    const chilled = input.orders.find((o) => o.temp === 'chilled' && input.outlets.get(o.outletId)!.parkingConstraint === 'normal')!;
    const out = input.outlets.get(chilled.outletId)!;
    const ambient = input.vehicles.find((v) => v.depot === 'Peliyagoda' && v.temp === 'ambient' && v.status === 'available' && v.type === 'truck')!;
    const v = e.validate(ambient, [{ brand: out.brand, district: out.district, orders: [chilled] }]);
    expect(v.map((x) => x.code)).toContain('TEMPERATURE');
  });

  it('flags a trip that breaks the Fresh time budget', () => {
    const input = inputFromCsv(DATA, 'Peliyagoda');
    const e = new Engine(input);
    const galle = input.orders.filter((o) => input.outlets.get(o.outletId)!.district === 'Galle' && o.temp === 'ambient' && input.outlets.get(o.outletId)!.brand === 'Fresh');
    const big = input.vehicles.find((v) => v.id === 'VEH011')!;
    const many = Array.from({ length: 12 }, (_, i) => ({ ...galle[i % galle.length], id: `X${i}`, ref: `X${i}`, weightKg: 1, volumeM3: 0.1 }));
    const v = e.validate(big, [{ brand: 'Fresh', district: 'Galle', orders: many }]);
    expect(v.length).toBeGreaterThan(0);
  });
});

describe('re-planning after a breakdown', () => {
  for (const broken of ['VEH007', 'VEH023']) {
    it(`re-homes ${broken}'s orders without breaking any rule`, () => {
      const input = inputFromCsv(DATA, 'Peliyagoda');
      const before = planDay(input);
      const lost = before.trips.filter((t) => t.vehicleId === broken);
      expect(lost.length).toBeGreaterThan(0);
      const orderById = new Map(input.orders.map((o) => [o.id, o]));
      const displaced = lost.flatMap((t) => t.stops.flatMap((s) => s.orderIds)).map((id) => orderById.get(id)!);

      // The vehicle is now out of service; everyone else keeps their trips.
      const after: EngineInput = { ...input, vehicles: input.vehicles.map((v) => (v.id === broken ? { ...v, status: 'in_workshop' } : v)) };
      const engine = new Engine(after);
      const drafts = new Map<string, { brand: string; district: string; orders: typeof displaced }[]>();
      for (const t of before.trips.filter((x) => x.vehicleId !== broken)) {
        drafts.set(t.vehicleId, [...(drafts.get(t.vehicleId) ?? []), { brand: t.brand, district: t.district, orders: t.stops.flatMap((s) => s.orderIds.map((id) => orderById.get(id)!)) }]);
      }
      const usable = after.vehicles.filter((v) => v.depot === 'Peliyagoda' && v.status === 'available');
      const res = engine.reassign(displaced, usable, drafts);

      expect(res.placed.length + res.unplaced.length).toBe(displaced.length);
      expect(res.placed.every((p) => p.vehicleId !== broken)).toBe(true);

      // Rebuild the whole day and run the independent checker over it.
      const trips = [...res.drafts].flatMap(([vid, ds]) => {
        const sched = engine.scheduleVehicle(usable.find((v) => v.id === vid)!, ds);
        expect(sched.violation).toBeUndefined();
        return sched.trips!;
      });
      const deferred = [...before.deferred, ...res.unplaced.map((u, i) => ({ orderId: u.order.id, reason: u.reason, reasonText: u.text, rank: 100 + i }))];
      expect(independentCheck(after, { ...before, trips, deferred })).toEqual([]);
    });
  }
});
