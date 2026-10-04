// Late-arrival risk, calibrated on the organisers' history (91,894 arrivals in route_legs_train.csv
// joined to delivery windows in deliveries_train.csv). The history's planned arrival times use the
// same free-flow formula as this engine's ETAs, so the model maps "minutes to spare at the planned
// ETA" straight to "chance the truck actually arrives after the window closes".
//
//   p = 1 / (1 + exp((slack - midpoint) / scale))
//
// Fitted by scripts/build_demo_data.py, which writes data/late_risk_model.csv; a unit test checks
// that these numbers match that file.
export const LATE_RISK_MODEL = {
  dry: { midpointMin: 34.7, scaleMin: 24.1 },     // 49,092 dry-season arrivals, 12.8% late
  monsoon: { midpointMin: 68.7, scaleMin: 27.7 }, // 42,802 monsoon arrivals, 27.3% late
} as const;

/** Probability (0.01–0.99) of arriving after the window closes, given minutes to spare at the planned ETA. */
export function lateRisk(slackMin: number, monsoon: boolean): number {
  const m = monsoon ? LATE_RISK_MODEL.monsoon : LATE_RISK_MODEL.dry;
  const p = 1 / (1 + Math.exp((slackMin - m.midpointMin) / m.scaleMin));
  return Math.min(0.99, Math.max(0.01, p));
}
