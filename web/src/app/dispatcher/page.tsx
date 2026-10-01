'use client';
// D1 · Order queue — every confirmed order for the next run, in one place, with what will break the plan surfaced first.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DispatcherShell, DepotSwitch, useDepot, brandTag, tempTag, Toast } from '@/components/DispatcherShell';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/client/api';
import { prettyDate } from '@/lib/time';

interface Outlet { id: string; brand: string; district: string; dockType: string; parkingConstraint: string; windowOpen: string; windowClose: string; mallWindow: string | null }
interface Order { id: string; ref: string; brand: string; temp: string; units: number; weightKg: number; volumeM3: number; source: string; status: string; deferredYesterday: boolean; daysSinceLastServed: number; outlet: Outlet; deliveryDate: string; createdAt: string }
interface Vehicle { id: string; temp: string; type: string; status: string; volumeCapM3: number }
interface Data { depot: string; date: string; calendar: { festivalRamp: number; monsoon: boolean; festival: string | null } | null; orders: Order[]; vehicles: Vehicle[]; laterOrders: Order[] }

const FILTERS = ['All', 'Chilled', 'Van-only', 'Mall window', 'Deferred yesterday', 'Phone orders'] as const;

export default function OrdersPage() {
  const [depot, setDepot] = useDepot();
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);
  const router = useRouter();

  const load = useCallback(() => api<Data>(`/api/orders?depot=${depot}`).then(setData).catch((e) => setToast({ msg: e.message, bad: true })), [depot]);
  useEffect(() => { void load(); }, [load]);

  const orders = useMemo(() => (data?.orders ?? []).filter((o) => o.status !== 'split'), [data]);
  const maxCap = Math.max(0, ...(data?.vehicles ?? []).filter((v) => v.status === 'available').map((v) => v.volumeCapM3));
  const reeferCap = (data?.vehicles ?? []).filter((v) => v.status === 'available' && v.temp === 'reefer').reduce((a, v) => a + v.volumeCapM3, 0);
  const chilled = orders.filter((o) => o.temp === 'chilled');
  const chilledM3 = chilled.reduce((a, o) => a + o.volumeM3, 0);
  const attention = (o: Order) => {
    if (o.volumeM3 > maxCap) return { t: 'Larger than any vehicle', c: 't-bad', w: 4 };
    if (o.deferredYesterday) return { t: 'Deferred yesterday', c: 't-warn', w: 3 };
    if (o.daysSinceLastServed >= 3) return { t: `${o.daysSinceLastServed} days since served`, c: 't-bad', w: 2 };
    if (o.outlet.parkingConstraint === 'van_only' && o.temp === 'chilled') return { t: 'Needs reefer van', c: '', w: 1 };
    return null;
  };
  const shown = orders
    .filter((o) => filter === 'All' || (filter === 'Chilled' && o.temp === 'chilled') || (filter === 'Van-only' && o.outlet.parkingConstraint === 'van_only') || (filter === 'Mall window' && o.outlet.dockType === 'mall_bay') || (filter === 'Deferred yesterday' && o.deferredYesterday) || (filter === 'Phone orders' && o.source === 'phone'))
    .filter((o) => !q || `${o.ref} ${o.outlet.id} ${o.outlet.district}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (attention(b)?.w ?? 0) - (attention(a)?.w ?? 0) || a.outlet.windowClose.localeCompare(b.outlet.windowClose));
  const count = (f: (typeof FILTERS)[number]) => f === 'All' ? orders.length : f === 'Chilled' ? chilled.length : f === 'Van-only' ? orders.filter((o) => o.outlet.parkingConstraint === 'van_only').length : f === 'Mall window' ? orders.filter((o) => o.outlet.dockType === 'mall_bay').length : f === 'Deferred yesterday' ? orders.filter((o) => o.deferredYesterday).length : orders.filter((o) => o.source === 'phone').length;
  const oversize = orders.filter((o) => o.volumeM3 > maxCap);
  const reefersOut = (data?.vehicles ?? []).filter((v) => v.temp === 'reefer' && v.status !== 'available').length;
  const reefersAll = (data?.vehicles ?? []).filter((v) => v.temp === 'reefer').length;

  async function buildPlan() {
    setBusy(true);
    try { await api('/api/plans', { json: { depot } }); router.push('/dispatcher/plan'); }
    catch (e) { setToast({ msg: (e as Error).message, bad: true }); setBusy(false); }
  }

  return (
    <DispatcherShell>
      <header className="topbar">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Orders for {data ? prettyDate(data.date, { weekday: 'long', day: 'numeric', month: 'long' }) : '…'}</h1>
        <span className="tag t-ink">Cutoff closed 16:00</span>
        {data?.calendar && data.calendar.festivalRamp > 0 && <span className="tag t-warn">New Year ramp · {data.calendar.festivalRamp}</span>}
        {data?.calendar?.monsoon && <span className="tag">Monsoon</span>}
        <div className="row right" style={{ gap: 12 }}><DepotSwitch depot={depot} onChange={setDepot} /></div>
      </header>
      <div className="content">
        <div className="grid-kpi">
          <div className="card kpi"><span className="lbl">Confirmed orders</span><span className="kv">{orders.length}</span><span className="muted" style={{ fontSize: 12 }}>{['Fresh', 'Style', 'Tech'].map((b) => `${b} ${orders.filter((o) => o.brand === b).length}`).join(' · ')}</span></div>
          <div className="card kpi"><span className="lbl">Volume</span><span className="kv">{orders.reduce((a, o) => a + o.volumeM3, 0).toFixed(1)} m³</span><span style={{ fontSize: 12, color: 'var(--chill-ink)', fontWeight: 600 }}>{chilledM3.toFixed(1)} m³ chilled ({chilled.length} orders)</span></div>
          <div className="card kpi"><span className="lbl">Weight</span><span className="kv">{(orders.reduce((a, o) => a + o.weightKg, 0) / 1000).toFixed(1)} t</span><span className="muted" style={{ fontSize: 12 }}>{orders.reduce((a, o) => a + o.units, 0).toLocaleString()} units</span></div>
          <div className="card kpi"><span className="lbl">Vehicles available</span><span className="kv">{(data?.vehicles ?? []).filter((v) => v.status === 'available').length} / {data?.vehicles.length ?? 0}</span><span style={{ fontSize: 12, fontWeight: 600, color: reefersOut ? 'var(--bad)' : 'var(--muted)' }}>{reefersOut} of {reefersAll} reefers in workshop</span></div>
          <div className="card kpi"><span className="lbl">For the next run</span><span className="kv">{data?.laterOrders.length ?? 0}</span><span className="muted" style={{ fontSize: 12 }}>Placed after cutoff or for later days</span></div>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <section className="card grow" style={{ minWidth: 640, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div className="row" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
              {FILTERS.map((f) => <button key={f} className={`btn btn-sm ${filter === f ? 'btn-p' : 'btn-s'}`} style={{ borderRadius: 999 }} onClick={() => setFilter(f)}>{f} {count(f)}</button>)}
              <label className="row right" style={{ border: '1px solid #C9C5BA', borderRadius: 8, padding: '0 10px', height: 34, width: 220 }}><Icon name="orders" size={14} /><span className="sr-only">Search</span><input placeholder="Outlet, order, district" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: 0, outline: 0, width: '100%' }} /></label>
            </div>
            <div className="scroll" style={{ maxHeight: 'calc(100vh - 300px)' }}>
              <table className="tbl">
                <thead><tr><th>Order</th><th>Outlet</th><th>Brand</th><th>District</th><th>Temp</th><th className="r">Units</th><th className="r">m³</th><th>Window</th><th>Access</th><th>Source</th><th>Needs attention</th></tr></thead>
                <tbody>
                  {shown.map((o) => { const a = attention(o); return (
                    <tr key={o.id} style={a?.w === 4 ? { background: '#FFF8EC' } : undefined}>
                      <td className="mono">{o.ref}</td><td className="mono">{o.outlet.id}</td><td>{brandTag(o.brand)}</td><td>{o.outlet.district}</td><td>{tempTag(o.temp)}</td>
                      <td className="r">{o.units}</td><td className="r">{a?.w === 4 ? <b>{o.volumeM3.toFixed(2)}</b> : o.volumeM3.toFixed(2)}</td>
                      <td>{o.outlet.windowOpen}–{o.outlet.windowClose}</td>
                      <td>{o.outlet.dockType === 'mall_bay' ? 'Mall bay' : o.outlet.dockType === 'rear_dock' ? 'Rear dock' : 'Street'}{o.outlet.parkingConstraint === 'van_only' ? ' · van only' : ''}</td>
                      <td>{o.source === 'phone' ? 'Phone · DF' : 'App'}</td>
                      <td>{a ? <span className={`tag ${a.c}`}>{a.t}</span> : null}</td>
                    </tr>); })}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ padding: '10px 14px', fontSize: 12, borderTop: '1px solid var(--line-soft)' }}>Showing {shown.length} of {orders.length} · sorted by “needs attention”, then window close</div>
          </section>
          <aside className="col" style={{ width: 330, gap: 12 }}>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div className="lbl" style={{ marginBottom: 4 }}>Before you plan</div>
              {oversize.map((o) => <div key={o.id} className="row" style={{ alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}><Icon name="alert" style={{ color: 'var(--bad)' }} /><span><b>{o.ref} must be split.</b> {o.volumeM3.toFixed(2)} m³ is larger than the biggest available vehicle ({maxCap} m³). You can split it on the deferral screen.</span></div>)}
              <div className="row" style={{ alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}><Icon name="lock" style={{ color: 'var(--warn)' }} /><span><b>{orders.filter((o) => o.deferredYesterday).length} orders deferred yesterday</b> go first and cannot be deferred again without a note.</span></div>
              <div className="row" style={{ alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}><Icon name="snow" style={{ color: 'var(--chill-ink)' }} /><span><b>Chilled demand is {reeferCap ? (chilledM3 / reeferCap).toFixed(1) : '—'}× reefer capacity</b> for one wave ({chilledM3.toFixed(1)} vs {reeferCap.toFixed(1)} m³).{chilledM3 > reeferCap ? ' Expect deferrals.' : ''}</span></div>
              <div className="row" style={{ alignItems: 'flex-start', gap: 10, padding: '10px 0' }}><Icon name="phone" /><span><b>{orders.filter((o) => o.source === 'phone').length} phone orders</b> were entered here and read back to the store with a reference.</span></div>
            </div>
            {!!data?.laterOrders.length && <div className="card" style={{ padding: '14px 16px' }}>
              <div className="lbl" style={{ marginBottom: 6 }}>For the next run</div>
              {data.laterOrders.slice(0, 6).map((o) => <div key={o.id} className="row" style={{ justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--line-soft)' }}><span className="mono">{o.outlet.id} · {o.temp}</span><span>{prettyDate(o.deliveryDate)}</span></div>)}
            </div>}
            <button className="btn btn-p" style={{ minHeight: 52, fontSize: 15 }} onClick={buildPlan} disabled={busy}>{busy ? 'Planning…' : <>Build plan for {data ? prettyDate(data.date) : ''}<Icon name="next" /></>}</button>
            <div className="muted" style={{ fontSize: 12 }}>Runs the planner: weight and volume, refrigeration, van-only access, delivery windows, time budgets, fuel quotas.</div>
          </aside>
        </div>
      </div>
      {toast && <Toast msg={toast.msg} bad={toast.bad} onDone={() => setToast(null)} />}
    </DispatcherShell>
  );
}
