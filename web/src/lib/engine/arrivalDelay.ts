// How far real arrivals ran behind the planned (free-flow) ETA, from 91,894 historical arrivals in
// route_legs_train.csv: 20th / 50th / 80th percentile in minutes, by season and stop position
// (stop 7 = 7th or later). Built by scripts/build_demo_data.py into data/arrival_delay_model.csv;
// a unit test checks this table matches that file.
type Q = readonly [p20: number, p50: number, p80: number];
export const ARRIVAL_DELAY: { dry: readonly Q[]; monsoon: readonly Q[] } = {
  dry: [[6, 18, 40], [8, 23, 48], [10, 28, 52], [12, 32, 63], [12, 36, 69], [13, 39, 73], [7, 42, 83]],
  monsoon: [[15, 32, 76], [22, 44, 92], [27, 52, 96], [34, 63, 117], [39, 74, 133], [45, 82, 143], [47, 93, 150]],
};

/** Likely arrival (median) and a 20–80% range, in minutes after midnight, for a stop's planned ETA. */
export function expectedArrival(etaMin: number, stopSeq: number, monsoon: boolean) {
  const [p20, p50, p80] = (monsoon ? ARRIVAL_DELAY.monsoon : ARRIVAL_DELAY.dry)[Math.min(Math.max(stopSeq, 1), 7) - 1];
  return { earliest: etaMin + p20, likely: etaMin + p50, latest: etaMin + p80 };
}
