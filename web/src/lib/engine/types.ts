// Types for the planning and allocation engine. The engine is pure: it takes plain data and
// returns a plan, so it can be unit-tested and reused (e.g. for the Datathon Task 2B allocation).

export type Temp = 'ambient' | 'chilled';

export interface EOrder {
  id: string;
  ref: string;
  outletId: string;
  brand: string;
  temp: Temp;
  units: number;
  weightKg: number;
  volumeM3: number;
  deferredYesterday: boolean;
  daysSinceLastServed: number;
}

export interface EOutlet {
  id: string;
  brand: string;
  district: string;
  depot: string;
  dockType: string;
  parkingConstraint: string; // normal | van_only | mall_dock
  windowOpen: string; // HH:MM
  windowClose: string;
}

export interface EVehicle {
  id: string;
  type: string; // truck | van
  temp: string; // reefer | ambient
  weightCapKg: number;
  volumeCapM3: number;
  kmPerL: number;
  weeklyFuelQuotaL: number;
  fuelUsedWeekL: number;
  depot: string;
  status: string;
}

export interface ETravel {
  district: string;
  depot: string;
  depotToDistrictKm: number;
  depotToDistrictMin: number;
  interStopKm: number;
  interStopMin: number;
}

export interface EngineInput {
  date: string;
  depot: string;
  monsoon: boolean;
  orders: EOrder[];
  outlets: Map<string, EOutlet>;
  vehicles: EVehicle[];
  travel: Map<string, ETravel>;
  /** service allowance minutes keyed by `${brand}|${dockType}` */
  service: Map<string, number>;
  /** traffic speed index (100 = free flow) keyed by `${district}|${hour}|${monsoon 0/1}` */
  speed?: Map<string, number>;
  /** extra minutes of window tolerance per outlet (store agreed to a later close) */
  windowExtensions?: Map<string, number>;
}

export interface PlannedStop {
  outletId: string;
  orderIds: string[];
  etaMin: number; // planned arrival, free-flow, minutes after midnight
  serviceStartMin: number;
  handlingMin: number;
  predServiceMin: number;
  predArrivalMin: number; // with traffic
  lateRisk: number; // 0..1
}

export interface PlannedTrip {
  vehicleId: string;
  tripNo: number;
  brand: string;
  district: string;
  carriesChilled: boolean;
  startMin: number;
  endMin: number; // back at depot
  tripMinutes: number; // official: outbound + inter-stop + handling
  km: number;
  fuelL: number;
  loadKg: number;
  loadM3: number;
  stops: PlannedStop[];
}

export type DeferReason = 'OVERSIZE' | 'REEFER_CAPACITY' | 'VAN_CAPACITY' | 'WINDOW' | 'FUEL' | 'FLEET_CAPACITY' | 'BREAKDOWN';

export interface DeferredOrder {
  orderId: string;
  reason: DeferReason;
  reasonText: string;
  rank: number; // 1 = should be served first next run
  suggestion?: { kind: 'extend_window'; vehicleId: string; tripNo: number; newCloseMin: number; extraMin: number };
}

export interface Violation {
  code: 'WEIGHT' | 'VOLUME' | 'TEMPERATURE' | 'VAN_ONLY' | 'BRAND_DISTRICT' | 'DEPOT' | 'WINDOW' | 'BUDGET' | 'FUEL' | 'TRIPS' | 'UNAVAILABLE';
  message: string;
}

export interface PlanResult {
  trips: PlannedTrip[];
  deferred: DeferredOrder[];
  stats: {
    orders: number;
    placed: number;
    deferred: number;
    volumeM3: number;
    placedVolumeM3: number;
    chilledM3: number;
    chilledPlacedM3: number;
    reeferCapacityPerWaveM3: number;
    vehiclesAvailable: number;
    vehiclesUsed: number;
    lockedPlaced: number;
    lockedTotal: number;
    lateRiskStops: number;
  };
}
