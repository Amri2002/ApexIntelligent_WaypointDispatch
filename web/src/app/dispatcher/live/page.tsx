'use client';
// D3 · Live run board — exceptions ranked by impact; offline vehicles show their last known stop, never a blank.
import { useCallback, useEffect, useState } from 'react';
import { DispatcherShell } from '@/components/DispatcherShell';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/client/api';
import type { TripView } from '@/lib/opsService';
import { fmt, slTime } from '@/lib/time';

interface Live {
  date: string;
  kpis: { vehiclesOut: number; trips: number; stopsDone: number; stopsTotal: number; lateRisk: number; offline: number; sealed: number };
  trips: TripView[];
  exceptions: { kind: string; title: string; body: string; at: string | null }[];
}
const KIND: Record<string, [string, string]> = { offline: ['t-off', 'No signal'], late: ['t-warn', 'Late risk'], flag: ['t-bad', 'Loader flag'], issue: ['t-bad', 'Store issue'], store_reply: ['t-ok', 'Store reply'], breakdown: ['t-bad', 'Breakdown'], awaiting: ['', 'Waiting'] };
const STATUS: Record<string, [string, string]> = { planned: ['', 'Not loaded'], loading: ['t-warn', 'Loading'], sealed: ['t-ink', 'Sealed'], departed: ['t-ok', 'On the road'], completed: ['', 'Completed'] };

export default function LivePage() {
  const [depot, setDepot] = useState<'all' | 'Peliyagoda' | 'Kandy'>('all');
  const [live, setLive] = useState<Live | null>(null);
  const load = useCallback(() => api<Live>(`/api/live${depot === 'all' ? '' : `?depot=${depot}`}`).then(setLive).catch(() => undefined), [depot]);
  useEffect(() => { void load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const k = live?.kpis;
  const trips = (live?.trips ?? []).slice().sort((a, b) => Number(b.isOffline) - Number(a.isOffline) || ['departed', 'sealed', 'loading', 'planned', 'completed'].indexOf(a.status) - ['departed', 'sealed', 'loading', 'planned', 'completed'].indexOf(b.status));
  return (
    <DispatcherShell badge={{ '/dispatcher/live': live?.exceptions.length ?? 0 }}>
      <header className="topbar">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Live run · Friday 10 April</h1>
        <span className="muted" style={{ fontSize: 12.5 }}>Updates every few seconds as records arrive</span>
        <div className="seg right" role="group" aria-label="Depot">{(['Peliyagoda', 'Kandy', 'all'] as const).map((d) => <button key={d} className={depot === d ? 'on' : ''} onClick={() => setDepot(d)}>{d === 'all' ? 'Both' : d}</button>)}</div>
      </header>
      <div className="content">
        <div className="grid-kpi">
          <div className="card kpi"><span className="lbl">Trips published</span><span className="kv">{k?.trips ?? 0}</span><span className="muted" style={{ fontSize: 12 }}>{k?.sealed ?? 0} loaded and sealed</span></div>
          <div className="card kpi"><span className="lbl">Vehicles out</span><span className="kv">{k?.vehiclesOut ?? 0}</span><span className="muted" style={{ fontSize: 12 }}>departed or done</span></div>
          <div className="card kpi"><span className="lbl">Stops done</span><span className="kv">{k?.stopsDone ?? 0} / {k?.stopsTotal ?? 0}</span><span className="muted" style={{ fontSize: 12 }}>{k?.stopsTotal ? Math.round((k.stopsDone / k.stopsTotal) * 100) : 0}%</span></div>
          <div className="card kpi"><span className="lbl">Late risk &gt; 30%</span><span className="kv" style={{ color: k?.lateRisk ? 'var(--warn)' : undefined }}>{k?.lateRisk ?? 0}</span><span className="muted" style={{ fontSize: 12 }}>pending stops, predicted</span></div>
          <div className="card kpi"><span className="lbl">Offline now</span><span className="kv">{k?.offline ?? 0}</span><span className="muted" style={{ fontSize: 12 }}>records saving on phones</span></div>
        </div>
        {!live?.trips.length && <div className="card" style={{ padding: 18 }}>No published plan yet. Publish a plan to see vehicles here.</div>}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <section className="card" style={{ width: 470, maxWidth: '100%', overflow: 'hidden' }}>
            <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}><span className="lbl">Needs you · ranked by impact</span><span className="muted right" style={{ fontSize: 12 }}>{live?.exceptions.length ?? 0} open</span></div>
            {(live?.exceptions ?? []).map((e, i) => (
              <div key={i} className="col" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line-soft)', gap: 6, background: e.kind === 'offline' ? '#F6F8FA' : undefined }}>
                <div className="row"><span className={`tag ${KIND[e.kind]?.[0] ?? ''}`}>{e.kind === 'offline' && <Icon name="wifiOff" size={13} />}{KIND[e.kind]?.[1] ?? e.kind}</span><b className="mono" style={{ fontSize: 13 }}>{e.title}</b><span className="muted right" style={{ fontSize: 12 }}>{e.at ? slTime(e.at) : ''}</span></div>
                <div style={{ fontSize: 13 }}>{e.body}</div>
                {e.kind === 'offline' && <div className="muted" style={{ fontSize: 12 }}>Auto-rule: alert only if nothing syncs before the last delivery window closes.</div>}
              </div>
            ))}
            {!live?.exceptions.length && <div className="muted" style={{ padding: 16 }}>Nothing needs you right now.</div>}
          </section>
          <section className="card grow" style={{ overflowX: 'auto', minWidth: 560 }}>
            <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}><span className="lbl">Vehicles</span><span className="muted right" style={{ fontSize: 12 }}>Striped stop = predicted while the vehicle is offline</span></div>
            <div className="scroll" style={{ maxHeight: 'calc(100vh - 280px)' }}>
              <table className="tbl">
                <thead><tr><th>Vehicle</th><th>Route</th><th>Stops</th><th>Next stop · ETA</th><th>Status</th><th>Last record</th></tr></thead>
                <tbody>{trips.map((t) => {
                  const done = t.stops.filter((s) => s.status !== 'pending').length;
                  const next = t.stops.find((s) => s.status === 'pending');
                  return (
                    <tr key={t.id}>
                      <td className="mono">{t.vehicleId} T{t.tripNo}</td>
                      <td>{t.depot === 'Peliyagoda' ? 'Pel' : 'Kan'} · {t.district}{t.carriesChilled && <Icon name="snow" size={12} style={{ marginLeft: 4, color: 'var(--chill-ink)' }} />}</td>
                      <td><span className="pips">{t.stops.map((s, i) => <i key={s.id} className={s.status !== 'pending' ? 'd' : t.isOffline && i === done ? 'p' : ''} />)}</span></td>
                      <td>{next ? `${next.outletId} · ${t.isOffline ? '~' : ''}${fmt(next.etaMin)}` : t.status === 'completed' ? 'Done' : 'Depot'}</td>
                      <td>{t.isOffline ? <span className="tag t-off">Offline · last known</span> : <span className={`tag ${STATUS[t.status]?.[0]}`}>{STATUS[t.status]?.[1]}</span>}{t.flags.length > 0 && <span className="tag t-bad" style={{ marginLeft: 4 }}>{t.flags.length} flag</span>}</td>
                      <td>{t.lastSyncAt ? slTime(t.lastSyncAt) : '—'}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </DispatcherShell>
  );
}
