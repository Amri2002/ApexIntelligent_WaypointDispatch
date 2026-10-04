// Waypoint Dispatch — data model (Drizzle ORM, PostgreSQL)
// One plan per depot per delivery date. A plan has trips; a trip has stops; each order is
// either placed on a stop or deferred with a recorded decision.
import { pgTable, text, integer, doublePrecision, boolean, timestamp, jsonb, primaryKey, uniqueIndex, index } from 'drizzle-orm/pg-core';

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull(), // DISPATCHER | LOADER | DRIVER | STORE_MANAGER
  passwordHash: text('password_hash').notNull(),
  depot: text('depot'),
  vehicleId: text('vehicle_id'),
  outletId: text('outlet_id'),
  createdAt: ts('created_at').defaultNow().notNull(),
});

// ---------- Reference data (from the shared datasets) ----------
export const outlets = pgTable('outlets', {
  id: text('id').primaryKey(),
  brand: text('brand').notNull(),
  district: text('district').notNull(),
  depot: text('depot').notNull(),
  dockType: text('dock_type').notNull(),
  parkingConstraint: text('parking_constraint').notNull(),
  mallWindow: text('mall_window'),
  /** Style outlets: the weekday their weekly delivery runs (from the delivery history). Null for Fresh and Tech. */
  deliveryWeekday: text('delivery_weekday'),
  windowOpen: text('window_open').notNull(),
  windowClose: text('window_close').notNull(),
});

export const vehicles = pgTable('vehicles', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // truck | van
  temp: text('temp').notNull(), // reefer | ambient
  weightCapKg: doublePrecision('weight_cap_kg').notNull(),
  volumeCapM3: doublePrecision('volume_cap_m3').notNull(),
  fuelType: text('fuel_type').notNull(),
  kmPerL: doublePrecision('km_per_l').notNull(),
  weeklyFuelQuotaL: doublePrecision('weekly_fuel_quota_l').notNull(),
  fuelUsedWeekL: doublePrecision('fuel_used_week_l').notNull().default(0),
  depot: text('depot').notNull(),
  status: text('status').notNull().default('available'), // available | in_workshop
});

export const districtTravel = pgTable('district_travel', {
  district: text('district').primaryKey(),
  depot: text('depot').notNull(),
  roadClass: text('road_class').notNull(),
  freeFlowKmh: doublePrecision('free_flow_kmh').notNull(),
  depotToDistrictKm: doublePrecision('depot_to_district_km').notNull(),
  depotToDistrictMin: doublePrecision('depot_to_district_min').notNull(),
  interStopKm: doublePrecision('inter_stop_km').notNull(),
  interStopMin: doublePrecision('inter_stop_min').notNull(),
});

export const serviceAllowance = pgTable('service_allowance', {
  brand: text('brand').notNull(),
  dockType: text('dock_type').notNull(),
  minutes: doublePrecision('minutes').notNull(),
}, (t) => [primaryKey({ columns: [t.brand, t.dockType] })]);

export const trafficSpeed = pgTable('traffic_speed', {
  district: text('district').notNull(),
  hour: integer('hour').notNull(),
  monsoon: integer('monsoon').notNull(),
  speedIndex: doublePrecision('speed_index').notNull(),
}, (t) => [primaryKey({ columns: [t.district, t.hour, t.monsoon] })]);

export const calendarDays = pgTable('calendar_days', {
  date: text('date').primaryKey(),
  dowName: text('dow_name').notNull(),
  isOperating: boolean('is_operating').notNull(),
  isHoliday: boolean('is_holiday').notNull(),
  isPayday: boolean('is_payday').notNull(),
  festival: text('festival'),
  festivalRamp: doublePrecision('festival_ramp').notNull(),
  monsoon: boolean('monsoon').notNull(),
  isoYear: integer('iso_year').notNull(),
  isoWeek: integer('iso_week').notNull(),
});

export const forecastWeeks = pgTable('forecast_weeks', {
  depot: text('depot').notNull(),
  isoYear: integer('iso_year').notNull(),
  isoWeek: integer('iso_week').notNull(),
  totalM3: doublePrecision('total_m3').notNull(),
  chilledM3: doublePrecision('chilled_m3').notNull(),
}, (t) => [primaryKey({ columns: [t.depot, t.isoYear, t.isoWeek] })]);

// ---------- Operational data ----------
export const plans = pgTable('plans', {
  id: id(),
  depot: text('depot').notNull(),
  date: text('date').notNull(),
  status: text('status').notNull().default('draft'), // draft | published
  createdAt: ts('created_at').defaultNow().notNull(),
  updatedAt: ts('updated_at').defaultNow().notNull(),
  publishedAt: ts('published_at'),
  publishedBy: text('published_by'),
  summary: jsonb('summary'),
}, (t) => [uniqueIndex('plans_depot_date').on(t.depot, t.date)]);

export const trips = pgTable('trips', {
  id: id(),
  planId: text('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  vehicleId: text('vehicle_id').notNull().references(() => vehicles.id),
  tripNo: integer('trip_no').notNull(),
  brand: text('brand').notNull(),
  district: text('district').notNull(),
  carriesChilled: boolean('carries_chilled').notNull().default(false),
  startMin: integer('start_min').notNull(),
  tripMinutes: integer('trip_minutes').notNull(),
  km: doublePrecision('km').notNull(),
  fuelL: doublePrecision('fuel_l').notNull(),
  loadKg: doublePrecision('load_kg').notNull(),
  loadM3: doublePrecision('load_m3').notNull(),
  status: text('status').notNull().default('planned'), // planned | loading | sealed | departed | completed
  sealedAt: ts('sealed_at'),
  departedAt: ts('departed_at'),
  completedAt: ts('completed_at'),
  lastSyncAt: ts('last_sync_at'),
  offlineSince: ts('offline_since'),
}, (t) => [uniqueIndex('trips_plan_vehicle_no').on(t.planId, t.vehicleId, t.tripNo)]);

export const stops = pgTable('stops', {
  id: id(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  outletId: text('outlet_id').notNull().references(() => outlets.id),
  etaMin: integer('eta_min').notNull(),
  predServiceMin: doublePrecision('pred_service_min').notNull(),
  lateRisk: doublePrecision('late_risk').notNull(),
  loaded: boolean('loaded').notNull().default(false),
  status: text('status').notNull().default('pending'), // pending | delivered | partial | refused | no_access
  arrivedAt: ts('arrived_at'),
  completedAt: ts('completed_at'),
  receiverName: text('receiver_name'),
  signature: text('signature'),
  photo: text('photo'),
  deliveredUnits: integer('delivered_units'),
  note: text('note'),
  gps: text('gps'),
  recordedOffline: boolean('recorded_offline').notNull().default(false),
  syncedAt: ts('synced_at'),
}, (t) => [index('stops_trip').on(t.tripId)]);

export const orders = pgTable('orders', {
  id: id(),
  ref: text('ref').notNull().unique(),
  outletId: text('outlet_id').notNull().references(() => outlets.id),
  depot: text('depot').notNull(),
  brand: text('brand').notNull(),
  temp: text('temp').notNull(), // ambient | chilled
  units: integer('units').notNull(),
  weightKg: doublePrecision('weight_kg').notNull(),
  volumeM3: doublePrecision('volume_m3').notNull(),
  deliveryDate: text('delivery_date').notNull(),
  source: text('source').notNull().default('app'), // app | phone
  status: text('status').notNull().default('confirmed'), // confirmed | planned | deferred | delivered | partial | refused | failed
  deferredYesterday: boolean('deferred_yesterday').notNull().default(false),
  daysSinceLastServed: integer('days_since_last_served').notNull().default(1),
  lines: jsonb('lines'),
  parentRef: text('parent_ref'),
  stopId: text('stop_id').references(() => stops.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').defaultNow().notNull(),
}, (t) => [index('orders_date_depot').on(t.deliveryDate, t.depot)]);

export const deferrals = pgTable('deferrals', {
  id: id(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  fromDate: text('from_date').notNull(),
  toDate: text('to_date').notNull(),
  reasonCode: text('reason_code').notNull(), // REEFER_CAPACITY | VAN_CAPACITY | WINDOW | FUEL | FLEET_CAPACITY | OVERSIZE | MANUAL
  reasonText: text('reason_text').notNull(),
  note: text('note'),
  status: text('status').notNull().default('proposed'), // proposed | confirmed
  rank: integer('rank').notNull().default(0),
  decidedBy: text('decided_by'),
  decidedAt: ts('decided_at'),
  storeImpact: text('store_impact'),
  createdAt: ts('created_at').defaultNow().notNull(),
});

export const loadFlags = pgTable('load_flags', {
  id: id(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  stopId: text('stop_id').references(() => stops.id, { onDelete: 'set null' }),
  item: text('item').notNull(),
  issueType: text('issue_type').notNull(), // missing | damaged | short_picked | wrong_temperature
  qty: integer('qty').notNull(),
  note: text('note'),
  photo: text('photo'),
  createdBy: text('created_by').notNull(),
  createdAt: ts('created_at').defaultNow().notNull(),
  resolved: boolean('resolved').notNull().default(false),
});

export const receipts = pgTable('receipts', {
  id: id(),
  stopId: text('stop_id').notNull().unique().references(() => stops.id, { onDelete: 'cascade' }),
  status: text('status').notNull(), // confirmed | issue
  issueType: text('issue_type'),
  qty: integer('qty'),
  note: text('note'),
  photo: text('photo'),
  matchedFlagId: text('matched_flag_id'),
  createdAt: ts('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: id(),
  audience: text('audience').notNull(), // DISPATCHER | LOADER:<depot> | DRIVER:<vehicle> | OUTLET:<outlet>
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  refId: text('ref_id'),
  response: text('response'),
  createdAt: ts('created_at').defaultNow().notNull(),
  readAt: ts('read_at'),
});

/** Idempotency log for offline sync: each client event is applied exactly once. */
export const syncEvents = pgTable('sync_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull(),
  clientAt: ts('client_at').notNull(),
  receivedAt: ts('received_at').defaultNow().notNull(),
  result: text('result').notNull(),
});
