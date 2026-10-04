import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readCsv } from './csv-input';
import { LATE_RISK_MODEL, lateRisk } from './lateRisk';

describe('late-risk model', () => {
  it('matches the parameters fitted on history (data/late_risk_model.csv)', () => {
    const rows = readCsv(path.resolve(__dirname, '../../../../data/late_risk_model.csv'));
    const dry = rows.find((r) => r.monsoon === '0')!, wet = rows.find((r) => r.monsoon === '1')!;
    expect(LATE_RISK_MODEL.dry).toEqual({ midpointMin: +dry.midpoint_min, scaleMin: +dry.scale_min });
    expect(LATE_RISK_MODEL.monsoon).toEqual({ midpointMin: +wet.midpoint_min, scaleMin: +wet.scale_min });
  });

  it('falls as slack grows and is higher in the monsoon', () => {
    expect(lateRisk(10, false)).toBeGreaterThan(lateRisk(60, false));
    expect(lateRisk(60, true)).toBeGreaterThan(lateRisk(60, false));
    // History: dry-season stops planned 45–60 min before closing were late ~29% of the time.
    expect(lateRisk(52, false)).toBeGreaterThan(0.2);
    expect(lateRisk(52, false)).toBeLessThan(0.4);
  });
});

import { ARRIVAL_DELAY, expectedArrival } from './arrivalDelay';
describe('arrival-delay model', () => {
  it('matches the percentiles measured on history (data/arrival_delay_model.csv)', () => {
    const rows = readCsv(path.resolve(__dirname, '../../../../data/arrival_delay_model.csv'));
    for (const r of rows) {
      const table = r.monsoon === '1' ? ARRIVAL_DELAY.monsoon : ARRIVAL_DELAY.dry;
      expect(table[+r.stop - 1]).toEqual([+r.p20_min, +r.p50_min, +r.p80_min]);
    }
  });
  it('puts the likely arrival after the planned ETA, inside its range', () => {
    const a = expectedArrival(300, 2, false);
    expect(a.earliest).toBeLessThanOrEqual(a.likely);
    expect(a.likely).toBeLessThanOrEqual(a.latest);
    expect(a.likely).toBeGreaterThan(300);
  });
});
