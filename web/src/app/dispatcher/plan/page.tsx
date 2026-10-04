'use client';
// D2 · Plan and allocate — the engine's proposal on a timeline, with live constraint checks and manual edits.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DispatcherShell, DepotSwitch, useDepot, DaySwitch, usePlanDate, Toast } from '@/components/DispatcherShell';
import { Icon } from '@/components/Icon';
import { api, ApiError } from '@/lib/client/api';
import type { PlanView } from '@/lib/planService';
import { fmt, prettyDate } from '@/lib/time';

const START = 3 * 60, END = 19 * 60, SPAN = END - START;
const pct = (m: number) => `${((Math.max(START, Math.min(END, m)) - START) / SPAN) * 100}%`;

export default function PlanPage() {
  const [depot, setDepot] = useDepot();
  const [date, day, setDay, days] = usePlanDate();
  const [view, setView] = useState<PlanView | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);
  const [moving, setMoving] = useState<{ orderId: string; ref: string } | null>(null);

  const load = useCallback(() => { if (!date) return; return api<PlanView>(`/api/plans?depot=${depot}&date=${date}`).then((v) => { setView(v); setSel((s) => (s && v.trips.some((t) => t.id === s) ? s : v.trips[0]?.id ?? null)); }); }, [depot, date]);
  useEffect(() => { void load(); }, [load]);

  const run = async () => { setBusy(true); try { const v = await api<PlanView>('/api/plans', { json: { depot, date } }); setView(v); setSel(v.trips[0]?.id ?? null); setToast({ msg: `Planned ${v.totals.placed} of ${v.totals.orders} orders` }); } catch (e) { setToast({ msg: (e as Error).message, bad: true }); } setBusy(false); };
  const publish = async () => { if (!view?.plan) return; setBusy(true); try { setView(await api<PlanView>(`/api/plans/${view.plan.id}/publish`, { json: {} })); setToast({ msg: 'Published to docks and drivers' }); } catch (e) { setToast({ msg: (e as Error).message, bad: true }); } setBusy(false); };
  const move = async (orderId: string, vehicleId: string | null) => {
    if (!view?.plan) return;
    setBusy(true);
    try { setView(await api<PlanView>(`/api/plans/${view.plan.id}/move`, { json: vehicleId ? { orderId, vehicleId } : { orderId, unplace: true } })); setToast({ msg: vehicleId ? `Moved to ${vehicleId} — all checks pass` : 'Taken off the plan — decide it on the Deferrals screen' }); setMoving(null); }
    catch (e) { setToast({ msg: `Not allowed: ${(e as ApiError).message}`, bad: true }); }
    setBusy(false);
  };

  const trips = view?.trips ?? [];
  const vehiclesWithTrips = useMemo(() => [...new Set(trips.map((t) => t.vehicleId))], [trips]);
  const trip = trips.find((t) => t.id === sel);
  const t = view?.totals;
  const published = view?.plan?.status === 'published';
  const idle = (view?.vehicles ?? []).filter((v) => v.status === 'available' && !vehiclesWithTrips.includes(v.id));

  return (
    <DispatcherShell badge={{ '/dispatcher/shortfall': t?.undecided ?? 0 }}>
      <header className="topbar">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Plan · {view ? prettyDate(view.date, { weekday: 'long', day: 'numeric', month: 'long' }) : '…'}</h1>
        {view?.plan && <span className={`tag ${published ? 't-ok' : ''}`}>{published ? `Published ${new Date(view.plan.publishedAt!).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} by ${view.plan.publishedBy}` : 'Draft'}</span>}
        <div className="row right" style={{ gap: 10 }}>
          <DaySwitch day={day} onChange={setDay} days={days} />
          <DepotSwitch depot={depot} onChange={setDepot} />
          {!published && <button className="btn btn-s" onClick={run} disabled={busy}>{view?.plan ? 'Re-run planner' : 'Run planner'}</button>}
          <button className="btn btn-p" onClick={publish} disabled={busy || !view?.plan || published || (t?.undecided ?? 0) > 0} title={(t?.undecided ?? 0) > 0 ? 'Decide the unplaced orders first' : ''}>{published ? 'Published' : 'Publish to docks and drivers'}</button>
        </div>
      </header>
      {view && t && t.undecided > 0 && (
        <Link href="/dispatcher/shortfall" className="banner" style={{ borderRadius: 0, background: 'var(--bad-bg)', color: '#7D160D', textDecoration: 'none', borderBottom: '1px solid #F0B9B2' }}>
          <Icon name="alert" size={20} />
          <span><b>{t.undecided} orders ({view.deferred.filter((d) => d.status === 'proposed').reduce((a, d) => a + d.order.volumeM3, 0).toFixed(1)} m³) cannot be placed.</b> {t.reeferWorkshop.length ? `${t.reeferWorkshop.length} of ${t.reefersTotal} reefers are in the workshop. ` : ''}{view.deferred.filter((d) => d.status === 'proposed' && d.outletSkippedYesterday).length} of these outlets were skipped yesterday.</span>
          <b className="right row">Review and decide<Icon name="next" /></b>
        </Link>
      )}
      {!view?.plan ? (
        <div className="content"><div className="card col" style={{ padding: 24, alignItems: 'flex-start' }}><h2 style={{ fontSize: 18 }}>No plan yet for {depot}</h2><p className="muted" style={{ margin: 0 }}>Run the planner to allocate the {t?.orders ?? ''} confirmed orders to vehicles and trips.</p><button className="btn btn-p" onClick={run} disabled={busy}>{busy ? 'Planning…' : 'Run planner'}</button></div></div>
      ) : (
        <div className="content" style={{ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <section className="col grow" style={{ gap: 12, minWidth: 620 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 }}>
              <Meter label="Chilled placed" value={`${t!.chilledPlacedM3} / ${t!.chilledM3} m³`} frac={t!.chilledM3 ? t!.chilledPlacedM3 / t!.chilledM3 : 1} color="var(--chill)" bad={t!.chilledPlacedM3 < t!.chilledM3} />
              <Meter label="Orders placed" value={`${t!.placed} / ${t!.orders}`} frac={t!.orders ? t!.placed / t!.orders : 1} />
              <Meter label="Stops at late risk" value={`${t!.lateRiskStops} over 30%`} frac={Math.min(1, t!.lateRiskStops / 20)} color="#B7791F" />
              <Meter label="Vehicles used" value={`${t!.vehiclesUsed} / ${t!.vehiclesAvailable}`} frac={t!.vehiclesAvailable ? t!.vehiclesUsed / t!.vehiclesAvailable : 0} color="var(--muted)" />
            </div>
            <div className="card" style={{ padding: '12px 14px' }}>
              <div className="row" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
                <span className="lbl">Vehicles and trips</span>
                <span className="row" style={{ fontSize: 12 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--chill-bg)', border: '1px solid #7FB6DA' }} />Carries chilled</span>
                <span className="row" style={{ fontSize: 12 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--line-soft)', border: '1px solid #C9C5BA' }} />Ambient only</span>
                <span className="muted right" style={{ fontSize: 12 }}>Select a trip to see its checks and move orders</span>
              </div>
              <div className="vrow" style={{ minHeight: 24 }}><span /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', fontSize: 10.5 }} className="mono muted">{Array.from({ length: 16 }, (_, i) => <span key={i}>{String(3 + i).padStart(2, '0')}</span>)}</div></div>
              {vehiclesWithTrips.map((vid) => {
                const v = view.vehicles.find((x) => x.id === vid)!;
                return (
                  <div className="vrow" key={vid}>
                    <div style={{ fontSize: 12.5 }}><b className="mono">{vid}</b><br /><span className="muted">{v.temp === 'reefer' ? 'Reefer' : 'Ambient'} {v.type} · {v.volumeCapM3} m³</span></div>
                    <div className="track">
                      <div className="grid">{Array.from({ length: 16 }, (_, i) => <span key={i} />)}</div>
                      {trips.filter((x) => x.vehicleId === vid).map((x) => (
                        <button key={x.id} className={`trip ${x.carriesChilled ? 'c' : ''} ${sel === x.id ? 'sel' : ''}`} style={{ left: pct(x.startMin), width: `${(x.tripMinutes / SPAN) * 100}%`, minWidth: 96 }} onClick={() => setSel(x.id)} title={`${x.brand} · ${x.district} · ${x.stops.length} stops`}>
                          T{x.tripNo} {x.district} · {x.stops.length}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="muted" style={{ fontSize: 12, paddingTop: 8 }}>{idle.length} available vehicles idle{idle.length ? ` (${idle.slice(0, 6).map((v) => v.id).join(', ')}${idle.length > 6 ? '…' : ''})` : ''} · {t!.workshop.length} in workshop</div>
            </div>
          </section>
          {trip && <TripPanel trip={trip} view={view} onMove={(o) => setMoving(o)} busy={busy} published={published} onUnplace={(id) => move(id, null)} />}
        </div>
      )}
      {moving && view && (
        <div role="dialog" aria-label="Move order" style={{ position: 'fixed', inset: 0, background: 'rgba(22,24,29,.45)', display: 'grid', placeItems: 'center', zIndex: 40 }} onClick={() => setMoving(null)}>
          <div className="card col" style={{ padding: 20, width: 420, maxWidth: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18 }}>Move {moving.ref} to…</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Every rule is re-checked. If the move breaks one, it is refused with the reason.</p>
            <div className="col scroll" style={{ maxHeight: 360, gap: 6 }}>
              {view.vehicles.filter((v) => v.status === 'available').map((v) => (
                <button key={v.id} className="btn btn-s" style={{ justifyContent: 'space-between' }} disabled={busy} onClick={() => move(moving.orderId, v.id)}>
                  <span className="mono">{v.id}</span><span className="muted" style={{ fontWeight: 500 }}>{v.temp} {v.type} · {v.volumeCapM3} m³ · {trips.filter((x) => x.vehicleId === v.id).length} trips</span>
                </button>
              ))}
            </div>
            <button className="btn btn-s" onClick={() => setMoving(null)}>Cancel</button>
          </div>
        </div>
      )}
      {toast && <Toast msg={toast.msg} bad={toast.bad} onDone={() => setToast(null)} />}
    </DispatcherShell>
  );
}

function Meter({ label, value, frac, color, bad }: { label: string; value: string; frac: number; color?: string; bad?: boolean }) {
  return (
    <div className="card col" style={{ padding: '10px 12px', gap: 6 }}>
      <span className="lbl">{label}</span><b style={{ fontSize: 13, color: bad ? 'var(--bad)' : undefined }}>{value}</b>
      <div className="meter"><span style={{ width: `${Math.round(frac * 100)}%`, background: color }} /></div>
    </div>
  );
}

function TripPanel({ trip, view, onMove, onUnplace, busy, published }: { trip: PlanView['trips'][number]; view: PlanView; onMove: (o: { orderId: string; ref: string }) => void; onUnplace: (id: string) => void; busy: boolean; published: boolean }) {
  const v = trip.vehicle;
  const vTrips = view.trips.filter((x) => x.vehicleId === v.id);
  const freshMin = vTrips.filter((x) => x.brand === 'Fresh').reduce((a, x) => a + x.tripMinutes, 0);
  const tradeMin = vTrips.filter((x) => x.brand !== 'Fresh').reduce((a, x) => a + x.tripMinutes, 0);
  const orders = trip.stops.flatMap((s) => s.orders);
  const chilled = orders.filter((o) => o.temp === 'chilled').length;
  const fuelLeft = view.vehicles.find((x) => x.id === v.id)?.fuelLeftL ?? 0;
  const slack = Math.min(...trip.stops.map((s) => { const [h, m] = s.outlet.windowClose.split(':').map(Number); return h * 60 + m - s.etaMin; }));
  const checks = [
    { ok: !chilled || v.temp === 'reefer', t: chilled ? `Refrigerated vehicle for ${chilled} chilled order${chilled > 1 ? 's' : ''}` : 'No chilled goods on this trip' },
    { ok: trip.loadKg <= v.weightCapKg && trip.loadM3 <= v.volumeCapM3, t: 'Weight and volume within limits' },
    { ok: trip.stops.every((s) => s.outlet.parkingConstraint !== 'van_only' || v.type === 'van'), t: v.type === 'van' ? 'Van can reach van-only streets' : 'No van-only outlets on a truck' },
    { ok: slack >= 0, t: `Every ETA inside its window · tightest slack ${Math.floor(slack / 60) ? `${Math.floor(slack / 60)} h ` : ''}${slack % 60} min` },
    { ok: trip.brand === 'Fresh' ? freshMin <= 270 : tradeMin <= 480, t: trip.brand === 'Fresh' ? `Fresh time budget ${freshMin} / 270 min` : `Trading-day budget ${tradeMin} / 480 min` },
    { ok: fuelLeft >= 0, t: `Fuel ${trip.fuelL} L at ${v.kmPerL} km/L · ${fuelLeft} L of ${v.weeklyFuelQuotaL} L weekly quota left after today` },
    { ok: vTrips.length <= 2, t: `Trip ${trip.tripNo} of ${vTrips.length} (max 2 a day)` },
  ];
  return (
    <aside className="card col" style={{ width: 410, padding: 16, gap: 12, flex: 'none' }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div><div className="lbl">Selected trip</div><div className="h" style={{ fontSize: 18, fontWeight: 700 }}>{v.id} · Trip {trip.tripNo} · {trip.district}</div><div className="muted" style={{ fontSize: 12.5 }}>{trip.brand} · depart {fmt(trip.startMin)} · {trip.tripMinutes} min · {trip.km} km</div></div>
        <span className={`tag right ${v.temp === 'reefer' ? 't-chill' : ''}`}>{v.temp === 'reefer' ? 'Reefer' : 'Ambient'}</span>
      </div>
      <table className="tbl">
        <thead><tr><th>#</th><th>Outlet</th><th>Window</th><th>ETA</th><th>Svc</th><th>Late</th></tr></thead>
        <tbody>{trip.stops.map((s) => (
          <tr key={s.id}><td>{s.seq}</td><td className="mono">{s.outlet.id}{s.orders.some((o) => o.deferredYesterday) && <Icon name="lock" size={13} style={{ color: 'var(--warn)', marginLeft: 3 }} />}</td><td>{s.outlet.windowOpen}–{s.outlet.windowClose}</td><td>{fmt(s.etaMin)}</td><td>{Math.round(s.predServiceMin)} m</td><td style={{ color: s.lateRisk > 0.3 ? 'var(--warn)' : undefined, fontWeight: s.lateRisk > 0.3 ? 700 : 400 }}>{Math.round(s.lateRisk * 100)}%</td></tr>
        ))}</tbody>
      </table>
      <div className="muted" style={{ fontSize: 11.5 }}>Svc = predicted service minutes. Late = chance of arriving after the window closes, from a model fitted on 91,894 past arrivals (dry vs monsoon). Lock = deferred yesterday.</div>
      <div className="col" style={{ gap: 6 }}>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}><span>Volume</span><b>{trip.loadM3.toFixed(1)} / {v.volumeCapM3} m³</b></div>
        <div className="meter"><span style={{ width: `${(trip.loadM3 / v.volumeCapM3) * 100}%`, background: 'var(--chill)' }} /></div>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}><span>Weight</span><b>{Math.round(trip.loadKg).toLocaleString()} / {v.weightCapKg.toLocaleString()} kg</b></div>
        <div className="meter"><span style={{ width: `${(trip.loadKg / v.weightCapKg) * 100}%` }} /></div>
      </div>
      <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
        <div className="lbl" style={{ marginBottom: 2 }}>Constraint checks</div>
        {checks.map((c, i) => <div key={i} className="row" style={{ alignItems: 'flex-start', fontSize: 12.5, padding: '4px 0' }}><Icon name={c.ok ? 'check' : 'alert'} style={{ color: c.ok ? 'var(--ok)' : 'var(--bad)' }} /><span>{c.t}</span></div>)}
      </div>
      {!published && <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
        <div className="lbl" style={{ marginBottom: 4 }}>Orders on this trip</div>
        {orders.map((o) => (
          <div key={o.id} className="row" style={{ fontSize: 12.5, padding: '4px 0' }}>
            <span className="mono">{o.ref}</span><span className="muted">{o.temp} · {o.volumeM3.toFixed(1)} m³</span>
            <span className="right row" style={{ gap: 4 }}><button className="btn btn-sm btn-s" disabled={busy} onClick={() => onMove({ orderId: o.id, ref: o.ref })}>Move…</button>{!o.deferredYesterday && <button className="btn btn-sm btn-s" disabled={busy} onClick={() => onUnplace(o.id)}>Defer</button>}</span>
          </div>
        ))}
      </div>}
    </aside>
  );
}
