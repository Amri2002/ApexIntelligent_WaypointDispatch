// Builds engine input straight from the CSVs in /data (used by tests and the Task 2B export script).
import fs from 'node:fs';
import path from 'node:path';
import type { EngineInput, EOrder, EOutlet, EVehicle, ETravel } from './types';

export function readCsv(file: string): Record<string, string>[] {
  const [head, ...lines] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const cols = head.split(',');
  return lines.map((l) => { const v = l.split(','); return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? ''])); });
}

export function inputFromCsv(dataDir: string, depot: string, opts: { monsoon?: boolean } = {}): EngineInput {
  const p = (f: string) => path.join(dataDir, f);
  const outlets = new Map<string, EOutlet>(readCsv(p('outlets.csv')).map((o) => [o.outlet_id, {
    id: o.outlet_id, brand: o.brand, district: o.district, depot: o.depot, dockType: o.dock_type, parkingConstraint: o.parking_constraint, windowOpen: o.window_open_time, windowClose: o.window_close_time,
  }]));
  const status = Object.fromEntries(readCsv(p('demo_fleet_status.csv')).map((r) => [r.vehicle_id, r.status]));
  const fuelUsed: Record<string, number> = fs.existsSync(p('fuel_used_week.csv')) ? Object.fromEntries(readCsv(p('fuel_used_week.csv')).map((r) => [r.vehicle_id, +r.fuel_used_l])) : {};
  const vehicles: EVehicle[] = readCsv(p('vehicles.csv')).map((v) => ({
    id: v.vehicle_id, type: v.type, temp: v.temp, weightCapKg: +v.weight_cap_kg, volumeCapM3: +v.volume_cap_m3, kmPerL: +v.km_per_l,
    weeklyFuelQuotaL: +v.weekly_fuel_quota_l, fuelUsedWeekL: fuelUsed[v.vehicle_id] ?? 0, depot: v.depot, status: status[v.vehicle_id] ?? 'available',
  }));
  const travel = new Map<string, ETravel>(readCsv(p('district_travel.csv')).map((t) => [t.district, {
    district: t.district, depot: t.depot, depotToDistrictKm: +t.depot_to_district_km, depotToDistrictMin: +t.depot_to_district_freeflow_min, interStopKm: +t.inter_stop_km, interStopMin: +t.inter_stop_freeflow_min,
  }]));
  const service = new Map(readCsv(p('service_allowance.csv')).map((s) => [`${s.brand}|${s.dock_type}`, +s.service_allowance_min]));
  const speed = new Map(readCsv(p('traffic_speed.csv')).map((s) => [`${s.district}|${s.hour}|${s.monsoon}`, +s.speed_index]));
  const orders: EOrder[] = readCsv(p('demo_day_orders.csv')).filter((o) => o.depot === depot).map((o) => ({
    id: o.order_ref, ref: o.order_ref, outletId: o.outlet_id, brand: outlets.get(o.outlet_id)!.brand, temp: o.temp_requirement as 'ambient' | 'chilled',
    units: +o.order_units, weightKg: +o.order_weight_kg, volumeM3: +o.order_volume_m3, deferredYesterday: o.deferred_yesterday === '1', daysSinceLastServed: +o.days_since_last_served,
  }));
  return { date: '2026-04-10', depot, monsoon: !!opts.monsoon, orders, outlets, vehicles, travel, service, speed };
}
