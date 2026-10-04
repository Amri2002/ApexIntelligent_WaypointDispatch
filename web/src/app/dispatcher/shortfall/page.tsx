'use client';
// G1 · Cold-chain shortfall — the dispatcher decides which unplaced orders wait, and why. Every decision is recorded and the store is told.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DispatcherShell, DepotSwitch, useDepot, DaySwitch, usePlanDate, Toast, brandTag } from '@/components/DispatcherShell';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/client/api';
import type { PlanView } from '@/lib/planService';
import { fmt, prettyDate } from '@/lib/time';

const REASONS: Record<string, string> = {
  REEFER_CAPACITY: 'Refrigerated capacity: vehicles in workshop',
  VAN_CAPACITY: 'Van capacity',
  WINDOW: 'Delivery window cannot be reached',
  FUEL: 'Weekly fuel quota',
  FLEET_CAPACITY: 'Fleet capacity',
  OVERSIZE: 'Order larger than any vehicle',
  MANUAL: 'Dispatcher decision',
};

export default function ShortfallPage() {
  const [depot, setDepot] = useDepot();
  const [date, day, setDay, days] = usePlanDate();
  const [view, setView] = useState<PlanView | null>(null);
  const [actions, setActions] = useState<Record<string, 'defer' | 'request_window'>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);

  const load = useCallback(() => { if (!date) return; return api<PlanView>(`/api/plans?depot=${depot}&date=${date}`).then((v) => {
    setView(v);
    const a: Record<string, 'defer' | 'request_window'> = {};
    v.deferred.forEach((d) => { a[d.orderId] = d.suggestion ? 'request_window' : 'defer'; });
    setActions(a);
    const codes = v.deferred.filter((d) => d.status === 'proposed').map((d) => d.reasonCode);
    const top = codes.sort((x, y) => codes.filter((c) => c === y).length - codes.filter((c) => c === x).length)[0];
    setReason(REASONS[top ?? 'FLEET_CAPACITY'] ?? REASONS.FLEET_CAPACITY);
  }); }, [depot, date]);
  useEffect(() => { void load(); }, [load]);

  const proposed = useMemo(() => (view?.deferred ?? []).filter((d) => d.status === 'proposed'), [view]);
  const decided = useMemo(() => (view?.deferred ?? []).filter((d) => d.status !== 'proposed'), [view]);
  const t = view?.totals;
  const toDefer = proposed.filter((d) => actions[d.orderId] !== 'request_window' && d.reasonCode !== 'OVERSIZE');
  const toAsk = proposed.filter((d) => actions[d.orderId] === 'request_window');
  const nextDate = proposed[0]?.toDate ?? decided[0]?.toDate;
  const lockedPlaced = (view?.trips ?? []).flatMap((x) => x.stops.flatMap((s) => s.orders)).filter((o) => o.deferredYesterday).map((o) => o.outletId);

  async function confirm() {
    if (!view?.plan) return;
    setBusy(true);
    try {
      const v = await api<PlanView>(`/api/plans/${view.plan.id}/decide`, { json: { reasonText: reason, decisions: proposed.filter((d) => d.reasonCode !== 'OVERSIZE').map((d) => ({ orderId: d.orderId, action: actions[d.orderId] ?? 'defer', note: notes[d.orderId] })) } });
      setView(v);
      setToast({ msg: `${toDefer.length} deferrals recorded and stores notified${toAsk.length ? `; ${toAsk.length} stores asked` : ''}` });
    } catch (e) { setToast({ msg: (e as Error).message, bad: true }); }
    setBusy(false);
  }
  async function split(orderId: string) {
    setBusy(true);
    try { const v = await api<PlanView>(`/api/orders/${orderId}/split`, { json: {} }); setView(v); setToast({ msg: 'Split into two loads and re-planned' }); void load(); }
    catch (e) { setToast({ msg: (e as Error).message, bad: true }); }
    setBusy(false);
  }

  return (
    <DispatcherShell badge={{ '/dispatcher/shortfall': proposed.length }}>
      <header className="topbar">
        <Link href="/dispatcher/plan" aria-label="Back to plan" style={{ color: 'var(--ink)', display: 'inline-flex' }}><Icon name="back" size={22} /></Link>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>{t && t.chilledPlacedM3 < t.chilledM3 ? 'Cold-chain shortfall' : 'Unplaced orders'} · {view ? prettyDate(view.date, { weekday: 'long', day: 'numeric', month: 'long' }) : ''} · {depot}</h1>
        {proposed.length > 0 ? <span className="tag t-bad">Needs your decision before publishing</span> : view?.plan ? <span className="tag t-ok">All decided</span> : null}
        <div className="row right" style={{ gap: 10 }}><DaySwitch day={day} onChange={setDay} days={days} /><DepotSwitch depot={depot} onChange={setDepot} /></div>
      </header>
      {!view?.plan ? <div className="content"><div className="card" style={{ padding: 20 }}>No plan yet. <Link href="/dispatcher">Build the plan</Link> first.</div></div> : (
        <div className="content" style={{ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <section className="col grow" style={{ gap: 12, minWidth: 640 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 }}>
              <div className="card kpi"><span className="lbl">Chilled ordered</span><span className="kv">{t!.chilledM3} m³</span><span className="muted" style={{ fontSize: 12 }}>Fresh chilled orders</span></div>
              <div className="card kpi"><span className="lbl">Reefer capacity per wave</span><span className="kv">{t!.reeferCapacityM3} m³</span><span className="muted" style={{ fontSize: 12 }}>{t!.reefersAvailable} running{t!.reeferWorkshop.length ? ` · ${t!.reeferWorkshop.join(', ')} in workshop` : ''}</span></div>
              <div className="card kpi"><span className="lbl">Chilled placed</span><span className="kv">{t!.chilledPlacedM3} m³</span><span className="muted" style={{ fontSize: 12 }}>{t!.placed} of {t!.orders} orders placed overall</span></div>
              <div className="card kpi" style={{ borderColor: proposed.length ? 'var(--bad)' : undefined }}><span className="lbl" style={{ color: proposed.length ? 'var(--bad)' : undefined }}>Cannot be placed</span><span className="kv" style={{ color: proposed.length ? 'var(--bad)' : undefined }}>{proposed.reduce((a, d) => a + d.order.volumeM3, 0).toFixed(1)} m³</span><span className="muted" style={{ fontSize: 12 }}>{proposed.length} orders awaiting a decision</span></div>
            </div>
            <div className="card banner" style={{ background: '#FFFBF2', borderColor: '#E8C98A', fontSize: 13 }}>
              <Icon name="lock" style={{ color: 'var(--warn)' }} />
              <span><b>Fairness check.</b> Orders deferred yesterday are placed first{lockedPlaced.length ? ` (${[...new Set(lockedPlaced)].join(', ')} are on today’s plan)` : ''}. {proposed.filter((d) => d.outletSkippedYesterday).length ? <><b>{[...new Set(proposed.filter((d) => d.outletSkippedYesterday).map((d) => d.outlet.id))].join(', ')} had an order deferred yesterday</b>, so deferring them again needs a note.</> : 'None of the outlets below was skipped yesterday.'}</span>
            </div>
            <div className="card" style={{ overflowX: 'auto' }}>
              <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}><span className="lbl">Unplaced orders · proposed action</span><span className="muted right" style={{ fontSize: 12 }}>Ranked: skipped recently → days since served → hardest to carry → window close</span></div>
              <div className="scroll">
                <table className="tbl">
                  <thead><tr><th>#</th><th>Order</th><th>Outlet</th><th>District</th><th className="r">m³</th><th>Window</th><th>Why</th><th>History</th><th>Proposed (editable)</th></tr></thead>
                  <tbody>
                    {proposed.map((d) => (
                      <tr key={d.id} style={d.suggestion ? { background: '#F4F9FD' } : undefined}>
                        <td>{d.rank}</td><td className="mono">{d.order.ref}</td><td className="mono">{d.outlet.id} {brandTag(d.outlet.brand)}</td><td>{d.outlet.district}</td><td className="r">{d.order.volumeM3.toFixed(2)}</td>
                        <td>{d.outlet.windowOpen}–{d.outlet.windowClose}</td>
                        <td title={d.reasonText}><span className="tag">{REASONS[d.reasonCode]?.split(':')[0] ?? d.reasonCode}</span></td>
                        <td>{d.outletSkippedYesterday ? <span className="tag t-warn">Skipped yesterday</span> : <span className="muted">{d.order.daysSinceLastServed} day{d.order.daysSinceLastServed > 1 ? 's' : ''} since served</span>}</td>
                        <td>
                          {d.reasonCode === 'OVERSIZE' ? <button className="btn btn-sm btn-p" disabled={busy} onClick={() => split(d.orderId)}>Split into two loads</button> : (
                            <div className="col" style={{ gap: 4 }}>
                              <select className="input" style={{ height: 32, fontSize: 12.5 }} value={actions[d.orderId] ?? 'defer'} onChange={(e) => setActions({ ...actions, [d.orderId]: e.target.value as 'defer' })} aria-label={`Action for ${d.order.ref}`}>
                                <option value="defer">Defer → {prettyDate(d.toDate)}, wave 1, locked</option>
                                {d.suggestion && <option value="request_window">Ask store to accept until {fmt(d.suggestion.newCloseMin)} · {d.suggestion.vehicleId}</option>}
                              </select>
                              {d.outletSkippedYesterday && actions[d.orderId] !== 'request_window' && <input className="input" style={{ height: 32, fontSize: 12.5, borderColor: notes[d.orderId] ? undefined : 'var(--bad)' }} placeholder="Note required (second skip)" value={notes[d.orderId] ?? ''} onChange={(e) => setNotes({ ...notes, [d.orderId]: e.target.value })} />}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!proposed.length && <tr><td colSpan={9} className="muted" style={{ padding: 16 }}>Nothing left to decide. {decided.length ? 'Decisions are listed below.' : 'Every order fits today.'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            {decided.length > 0 && <div className="card" style={{ padding: '12px 14px' }}>
              <div className="lbl" style={{ marginBottom: 6 }}>Recorded decisions</div>
              {decided.map((d) => <div key={d.id} className="row" style={{ fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid var(--line-soft)', flexWrap: 'wrap' }}><span className="mono">{d.order.ref}</span><span className="mono">{d.outlet.id}</span><span className={`tag ${d.status === 'requested' ? 't-warn' : 't-ink'}`}>{d.status === 'requested' ? 'Waiting for store reply' : `Deferred → ${prettyDate(d.toDate)}`}</span><span className="muted">{d.reasonText}{d.note ? ` · “${d.note}”` : ''}{d.decidedBy ? ` · ${d.decidedBy}` : ''}</span>{d.storeImpact && <span className="tag t-bad">Store: {d.storeImpact}</span>}</div>)}
            </div>}
          </section>
          <aside className="col" style={{ width: 380, gap: 12 }}>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div className="lbl" style={{ marginBottom: 2 }}>If you confirm</div>
              <Cq icon="check" b={`${toDefer.length} orders (${toDefer.reduce((a, d) => a + d.order.volumeM3, 0).toFixed(1)} m³) move to ${nextDate ? prettyDate(nextDate) : 'the next run'}`} t="placed first on the next run; deferring one again needs a written note. Their other orders still go today." />
              <Cq icon="phone" b={`${new Set(toDefer.map((d) => d.outlet.id)).size} store managers get a deferral notice now`} t="with the reason and the new date, before they roster tomorrow’s staff." />
              {toAsk.length > 0 && <Cq icon="clock" b={`${toAsk.length} stores are asked for a later window`} t="A yes places the order on the suggested vehicle; a no defers it automatically." />}
              <Cq icon="alert" red b="The next run carries this volume" t={`on top of its own orders. Check the forecast before releasing workshop vehicles.`} link />
            </div>
            <div className="card col" style={{ padding: '14px 16px' }}>
              <label className="lbl" htmlFor="reason">Reason (recorded on every deferral)</label>
              <select id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{[...new Set(Object.values(REASONS))].map((r) => <option key={r}>{r}</option>)}</select>
            </div>
            <button className="btn btn-p" style={{ minHeight: 52, fontSize: 15 }} disabled={busy || !proposed.some((d) => d.reasonCode !== 'OVERSIZE')} onClick={confirm}>Confirm {toDefer.length} deferral{toDefer.length === 1 ? '' : 's'}{toAsk.length ? ` and send ${toAsk.length} request${toAsk.length > 1 ? 's' : ''}` : ''}</button>
            <div className="row"><Link className="btn btn-s grow" href="/dispatcher/plan">Back to plan</Link>{!proposed.length && view?.plan?.status !== 'published' && <Link className="btn btn-p grow" href="/dispatcher/plan">Publish the plan</Link>}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>Logged with who, when, the reason, and the alternatives shown on this screen.</div>
          </aside>
        </div>
      )}
      {toast && <Toast msg={toast.msg} bad={toast.bad} onDone={() => setToast(null)} />}
    </DispatcherShell>
  );
}

function Cq({ icon, b, t, red, link }: { icon: string; b: string; t: string; red?: boolean; link?: boolean }) {
  return <div className="row" style={{ alignItems: 'flex-start', gap: 10, fontSize: 12.5, padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}><Icon name={icon} style={{ color: red ? 'var(--bad)' : undefined }} /><span><b>{b}</b> {t} {link && <Link href="/dispatcher/forecast">See forecast</Link>}</span></div>;
}
