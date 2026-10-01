'use client';
// D4 · Capacity forecast — weekly chilled demand as a share of reefer capacity, turned into one decision.
import { useEffect, useState } from 'react';
import { DispatcherShell, DepotSwitch, useDepot } from '@/components/DispatcherShell';
import { api } from '@/lib/client/api';
import { prettyDate } from '@/lib/time';

interface Row { week: number; start: string; totalM3: number; chilledM3: number; operatingDays: number; reefersInService: number; reeferCapM3: number; utilisation: number; events: string[] }
interface F { depot: string; reefers: number; rows: Row[]; demoWeek: number; workshop: { id: string; cap: number }[] }

export default function ForecastPage() {
  const [depot, setDepot] = useDepot();
  const [f, setF] = useState<F | null>(null);
  const [hover, setHover] = useState<Row | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true; // ignore a slower response for the depot we just switched away from
    setF(null); setErr(null);
    api<F>(`/api/forecast?depot=${depot}`)
      .then((x) => { if (!live) return; setF(x); setHover(x.rows.find((r) => r.week === x.demoWeek) ?? x.rows[0] ?? null); })
      .catch((e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [depot]);

  const rows = f?.rows ?? [];
  const H = 260, W = 720, pad = 50, bw = (W - pad) / Math.max(1, rows.length);
  const y = (u: number) => H - Math.min(1.1, u) * (H - 20);
  const risky = rows.filter((r) => r.utilisation > 0.85);
  const best = rows.filter((r) => r.week > (f?.demoWeek ?? 0)).sort((a, b) => a.utilisation - b.utilisation)[0];
  const freed = f?.workshop.slice(0, 2) ?? [];
  const peak = rows.find((r) => r.week === f?.demoWeek);
  const after = peak && freed.length ? peak.chilledM3 / ((peak.reeferCapM3 / peak.operatingDays + freed.reduce((a, v) => a + v.cap, 0)) * peak.operatingDays) : null;

  return (
    <DispatcherShell>
      <header className="topbar">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Capacity forecast · next {rows.length} weeks</h1>
        <span className="tag">Weekly volume model · seasonal × recent trend</span>
        <div className="row right"><DepotSwitch depot={depot} onChange={setDepot} /></div>
      </header>
      <div className="content" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <section className="col grow" style={{ minWidth: 620, gap: 14 }}>
          {err && <div className="tag t-bad" role="alert">Could not load the forecast: {err}</div>}
          {!f && !err && <div className="muted">Loading forecast…</div>}
          <div className="card" style={{ padding: '18px 20px' }}>
            <h2 style={{ fontSize: 17 }}>Forecast chilled demand as a share of available reefer capacity</h2>
            <div className="muted" style={{ fontSize: 12.5 }}>{depot} · one pre-08:00 wave per reefer per operating day · after planned workshop days</div>
            <svg viewBox={`0 0 ${W} ${H + 40}`} style={{ width: '100%', height: 320 }} role="img" aria-label="Weekly reefer utilisation forecast">
              {[0, 0.25, 0.5, 0.75, 1].map((g) => <g key={g}><line x1={pad} x2={W} y1={y(g)} y2={y(g)} stroke="#ECEAE4" /><text x={pad - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="#5B5F68" fontFamily="IBM Plex Mono">{g * 100}%</text></g>)}
              <line x1={pad} x2={W} y1={y(0.85)} y2={y(0.85)} stroke="#16181D" strokeDasharray="5 4" strokeWidth="1.5" />
              <text x={W - 4} y={y(0.85) - 6} textAnchor="end" fontSize="11.5" fontWeight="600" fill="#16181D">85% · plan-risk line</text>
              {rows.map((r, i) => {
                const x = pad + i * bw + bw * 0.2, w = bw * 0.6, top = y(r.utilisation);
                return (
                  <g key={r.week} onMouseEnter={() => setHover(r)} style={{ cursor: 'pointer' }}>
                    <rect x={pad + i * bw} y={0} width={bw} height={H + 30} fill="transparent" />
                    <path d={`M${x} ${H}V${top + 4}a4 4 0 0 1 4-4h${w - 8}a4 4 0 0 1 4 4V${H}z`} fill={hover?.week === r.week ? '#0F5A8A' : '#1F6FA8'} />
                    <text x={x + w / 2} y={top - 6} textAnchor="middle" fontSize="11" fontFamily="IBM Plex Mono" fill="#30333A">{Math.round(r.utilisation * 100)}%</text>
                    <text x={x + w / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="#30333A" fontWeight={r.week === f?.demoWeek ? 700 : 400}>{prettyDate(r.start, { day: 'numeric', month: 'short' })}</text>
                    {r.events.length > 0 && <text x={x + w / 2} y={H + 31} textAnchor="middle" fontSize="10" fill="#5B5F68">{r.events[0].replace('_', ' ')}</text>}
                  </g>
                );
              })}
            </svg>
            {hover && <div className="muted" style={{ fontSize: 12.5 }}>Week of {prettyDate(hover.start)}: forecast {hover.chilledM3} m³ chilled ({hover.totalM3} m³ total) against {hover.reeferCapM3} m³ of reefer capacity · {hover.reefersInService} of {f?.reefers} reefers · {hover.operatingDays} operating days</div>}
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Week of</th><th className="r">Chilled m³</th><th className="r">All volume m³</th><th className="r">Reefers in service</th><th className="r">Utilisation</th><th>Calendar</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.week} style={r.utilisation > 0.85 ? { background: '#FFF8EC', fontWeight: 600 } : undefined}><td>{prettyDate(r.start)}</td><td className="r">{r.chilledM3}</td><td className="r">{r.totalM3}</td><td className="r">{r.reefersInService} / {f?.reefers}</td><td className="r">{Math.round(r.utilisation * 100)}%</td><td>{r.events.map((e) => <span key={e} className="tag t-warn" style={{ marginRight: 4 }}>{e.replace('_', ' ')}</span>)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
        <aside className="col" style={{ width: 380, gap: 14 }}>
          <div className="card col" style={{ padding: 18, borderColor: 'var(--ink)' }}>
            <div className="lbl">Recommendation</div>
            {risky.length && freed.length && best ? <>
              <div className="h" style={{ fontSize: 18, fontWeight: 700 }}>Move {freed.map((v) => v.id).join(' and ')} servicing from the week of {prettyDate(risky[0].start)} to {prettyDate(best.start)}</div>
              <p style={{ margin: 0, fontSize: 13 }}>Weekly totals hide the peak: festival demand lands on the days before the holiday. {freed.map((v) => v.id).join(' and ')} add {freed.reduce((a, v) => a + v.cap, 0).toFixed(1)} m³ per wave. The week of {prettyDate(best.start)} has the lowest forecast.</p>
              {after != null && <div className="row" style={{ gap: 8 }}><div className="card grow" style={{ padding: 10, background: 'var(--ground)' }}><div className="lbl">Week of {prettyDate(risky[0].start)}</div><b className="h" style={{ fontSize: 18 }}>{Math.round(risky[0].utilisation * 100)}% → {Math.round(after * 100)}%</b></div></div>}
            </> : <div style={{ fontSize: 13 }}>No week crosses the 85% line with the current workshop schedule.</div>}
          </div>
          <div className="card col" style={{ padding: '16px 18px', fontSize: 13 }}>
            <div className="lbl">What this means for the fleet</div>
            <div><b>Drivers.</b> Every vehicle has its driver, so the forecast plans vehicles, not staff.</div>
            <div><b>Ambient trucks.</b> Total volume peaks at {Math.max(0, ...rows.map((r) => r.totalM3))} m³ a week; ambient trucks are not the limit.</div>
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>Forecast = same ISO week last year × the ratio of the last eight weeks this year to the same weeks last year, from the order history. The Datathon model replaces this.</div>
        </aside>
      </div>
    </DispatcherShell>
  );
}
