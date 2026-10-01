// Seeds the database from the competition CSVs in /data.
// Used by `npm run db:seed` (scripts/seed.mjs) and by the dispatcher's "Reset demo" action.
// Plain SQL through node-postgres so it runs anywhere without a build step.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

export const DEMO_DATE = '2026-04-10';
export const DEMO_PASSWORD = 'Waypoint@2026';

function readCsv(dir, file) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8').trim();
  const [head, ...lines] = text.split(/\r?\n/);
  const cols = head.split(',');
  return lines.map((l) => {
    const v = l.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? '']));
  });
}

export function resolveDataDir() {
  const candidates = [process.env.DATA_DIR, path.resolve(process.cwd(), '../data'), path.resolve(process.cwd(), 'data'), '/app/data'].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(path.join(c, 'outlets.csv'))) return c;
  throw new Error('Seed data not found. Set DATA_DIR to the folder that contains outlets.csv');
}

/** Multi-row INSERT in chunks. */
async function insert(client, table, cols, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const params = [];
    const values = chunk.map((r) => '(' + r.map((v) => { params.push(v); return '$' + params.length; }).join(',') + ')');
    await client.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${values.join(',')}`, params);
  }
}

/** Fuel already used Mon–Thu before the plan day: 40–64% of the weekly quota, deterministic per vehicle. */
function fuelUsed(id, quota) {
  const n = parseInt(id.replace(/\D/g, ''), 10);
  return Math.round(quota * (0.4 + ((n * 37) % 25) / 100));
}

export async function seedReference(client, dir) {
  const outlets = readCsv(dir, 'outlets.csv');
  const vehicles = readCsv(dir, 'vehicles.csv');
  const fleet = Object.fromEntries(readCsv(dir, 'demo_fleet_status.csv').map((r) => [r.vehicle_id, r.status]));
  await insert(client, 'outlets', ['id', 'brand', 'district', 'depot', 'dock_type', 'parking_constraint', 'mall_window', 'window_open', 'window_close'],
    outlets.map((o) => [o.outlet_id, o.brand, o.district, o.depot, o.dock_type, o.parking_constraint, o.mall_window || null, o.window_open_time, o.window_close_time]));
  await insert(client, 'vehicles', ['id', 'type', 'temp', 'weight_cap_kg', 'volume_cap_m3', 'fuel_type', 'km_per_l', 'weekly_fuel_quota_l', 'fuel_used_week_l', 'depot', 'status'],
    vehicles.map((v) => [v.vehicle_id, v.type, v.temp, +v.weight_cap_kg, +v.volume_cap_m3, v.fuel_type, +v.km_per_l, +v.weekly_fuel_quota_l, fuelUsed(v.vehicle_id, +v.weekly_fuel_quota_l), v.depot, fleet[v.vehicle_id] || 'available']));
  await insert(client, 'district_travel', ['district', 'depot', 'road_class', 'free_flow_kmh', 'depot_to_district_km', 'depot_to_district_min', 'inter_stop_km', 'inter_stop_min'],
    readCsv(dir, 'district_travel.csv').map((t) => [t.district, t.depot, t.road_class, +t.free_flow_kmh, +t.depot_to_district_km, +t.depot_to_district_freeflow_min, +t.inter_stop_km, +t.inter_stop_freeflow_min]));
  await insert(client, 'service_allowance', ['brand', 'dock_type', 'minutes'],
    readCsv(dir, 'service_allowance.csv').map((s) => [s.brand, s.dock_type, +s.service_allowance_min]));
  await insert(client, 'traffic_speed', ['district', 'hour', 'monsoon', 'speed_index'],
    readCsv(dir, 'traffic_speed.csv').map((s) => [s.district, +s.hour, +s.monsoon, +s.speed_index]));
  await insert(client, 'calendar_days', ['date', 'dow_name', 'is_operating', 'is_holiday', 'is_payday', 'festival', 'festival_ramp', 'monsoon', 'iso_year', 'iso_week'],
    readCsv(dir, 'calendar.csv').map((c) => [c.date, c.dow_name, c.is_operating === '1', c.is_holiday === '1', c.is_payday === '1', c.festival || null, +c.festival_ramp || 0, c.monsoon === '1', +c.iso_year, +c.iso_week]));
  await insert(client, 'forecast_weeks', ['depot', 'iso_year', 'iso_week', 'total_m3', 'chilled_m3'],
    readCsv(dir, 'forecast_weekly.csv').map((f) => [f.depot, +f.iso_year, +f.iso_week, +f.forecast_total_m3, +f.forecast_chilled_m3]));
}

export async function clearOperational(client) {
  await client.query('TRUNCATE sync_events, notifications, receipts, load_flags, deferrals, orders, stops, trips, plans, users RESTART IDENTITY CASCADE');
  // Restore workshop status and fuel in case the demo changed them.
}

export async function seedOperational(client, dir) {
  const outlets = Object.fromEntries(readCsv(dir, 'outlets.csv').map((o) => [o.outlet_id, o]));
  const orders = readCsv(dir, 'demo_day_orders.csv');
  // Every 9th order arrived by phone and was entered by the dispatcher (illustrative).
  await insert(client, 'orders', ['id', 'ref', 'outlet_id', 'depot', 'brand', 'temp', 'units', 'weight_kg', 'volume_m3', 'delivery_date', 'source', 'deferred_yesterday', 'days_since_last_served'],
    orders.map((o, i) => [randomUUID(), o.order_ref, o.outlet_id, o.depot, outlets[o.outlet_id].brand, o.temp_requirement, +o.order_units, +o.order_weight_kg, +o.order_volume_m3, DEMO_DATE,
      i % 9 === 4 ? 'phone' : 'app', o.deferred_yesterday === '1', +o.days_since_last_served || 1]));
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await insert(client, 'users', ['id', 'email', 'name', 'role', 'password_hash', 'depot', 'vehicle_id', 'outlet_id'], [
    [randomUUID(), 'dispatcher@waypoint.lk', 'Dilani Fernando', 'DISPATCHER', hash, 'Peliyagoda', null, null],
    [randomUUID(), 'loader@waypoint.lk', 'Ruwan Bandara', 'LOADER', hash, 'Kandy', null, null],
    [randomUUID(), 'driver@waypoint.lk', 'Nuwan Jayasinghe', 'DRIVER', hash, 'Kandy', null, null],
    [randomUUID(), 'store@waypoint.lk', 'Fathima Rizna', 'STORE_MANAGER', hash, 'Kandy', null, 'OUT106'],
  ]);
}

export async function seedAll(client, { force = false } = {}) {
  const dir = resolveDataDir();
  const { rows: [o] } = await client.query('SELECT count(*)::int AS n FROM outlets');
  if (o.n === 0) await seedReference(client, dir);
  const { rows: [u] } = await client.query('SELECT count(*)::int AS n FROM users');
  if (u.n === 0 || force) {
    await client.query('BEGIN');
    try {
      await clearOperational(client);
      await seedOperational(client, dir);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    return 'seeded demo day ' + DEMO_DATE;
  }
  return 'already seeded';
}
