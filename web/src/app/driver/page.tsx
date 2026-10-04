'use client';
// V1 · Today's run, V2 · Record a stop, G2 · No signal, G3 · Back online.
// The run is saved on the phone; every stop record is queued on the device and sent when there is signal.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FieldBar } from '@/components/FieldBar';
import { Icon } from '@/components/Icon';
import { SignaturePad } from '@/components/SignaturePad';
import { api } from '@/lib/client/api';
import { cached, enqueue, isOnline, useOutbox } from '@/lib/client/outbox';
import { compressPhoto } from '@/lib/client/image';
import type { TripView } from '@/lib/opsService';
import { fmt, prettyDate, slTime } from '@/lib/time';
import { storyNow, planTime } from '@/lib/client/clock';

interface Run { date: string; vehicleId: string | null; vehicles: string[]; trips: TripView[] }
type Stop = TripView['stops'][number];
const OUTCOMES = [['delivered', 'Delivered in full'], ['partial', 'Part delivered'], ['refused', 'Store refused'], ['no_access', 'Could not access']] as const;

export default function DriverPage() {
  const [vehicle, setVehicle] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [openStop, setOpenStop] = useState<string | null>(null);
  const { pending, online, report, clearReport } = useOutbox();

  useEffect(() => { setVehicle(localStorage.getItem('wp-driver-vehicle')); }, []);
  const load = useCallback(async () => {
    const r = await cached(`driver-run:${vehicle ?? 'default'}`, () => api<Run>(`/api/driver/run${vehicle ? `?vehicle=${vehicle}` : ''}`));
    if (r.data) setRun(r.data); setFromCache(r.fromCache);
  }, [vehicle]);
  useEffect(() => { void load(); }, [load, pending.length]);

  // Overlay events that are still on the phone.
  const local = useMemo(() => {
    const departed = new Set<string>(); const stops = new Map<string, Record<string, unknown>>();
    for (const e of pending) { if (e.kind === 'driver.depart') departed.add(String(e.payload.tripId)); if (e.kind === 'driver.stop') stops.set(String(e.payload.stopId), e.payload); }
    return { departed, stops };
  }, [pending]);

  const trips = run?.trips ?? [];
  const stopStatus = (s: Stop) => (local.stops.get(s.id)?.outcome as string | undefined) ?? s.status;
  const trip = trips.find((t) => t.stops.some((s) => stopStatus(s) === 'pending')) ?? trips[trips.length - 1];
  const departed = !!trip && (local.departed.has(trip.id) || ['departed', 'completed'].includes(trip.status));

  // Heartbeat while on the road and online, so the dispatcher can tell "quiet" from "no signal".
  useEffect(() => {
    if (!trip || !departed) return;
    const beat = () => { if (isOnline()) void fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: [{ id: `hb-${trip.id}-${Date.now()}`, kind: 'driver.heartbeat', at: storyNow().toISOString(), payload: { tripId: trip.id } }] }) }).catch(() => undefined); };
    beat(); const t = setInterval(beat, 30000); return () => clearInterval(t);
  }, [trip, departed, online]);

  const showReport = online && report && report.events.some((e) => e.kind === 'driver.stop');
  if (showReport) return <SyncReport report={report!} trip={trip} onDone={() => void clearReport()} />;

  const stop = trip?.stops.find((s) => s.id === openStop);
  // A finished stop opens as a read-only record of what was saved, never as a new form.
  if (trip && stop && stopStatus(stop) !== 'pending') return <StopRecord trip={trip} stop={stop} saved={local.stops.get(stop.id)} onBack={() => setOpenStop(null)} />;
  if (trip && stop) return <StopScreen key={stop.id} trip={trip} stop={stop} date={run!.date} online={online} pendingCount={pending.length} onDone={(next) => setOpenStop(next ?? null)} />;

  const next = trip?.stops.find((s) => stopStatus(s) === 'pending');
  const lastReturn = trip ? trip.startMin + trip.tripMinutes + 60 : 0;
  return (
    <div className="phone">
      <FieldBar kicker={`Nuwan J. · ${run ? prettyDate(run.date) : ''}`} title={trip ? `${trip.vehicleId} · Trip ${trip.tripNo}` : 'Today’s run'} offlineTitle />
      <main className="pbody">
        {(run?.vehicles.length ?? 0) > 1 && (
          <label className="row" style={{ fontSize: 13 }}><span className="muted">Vehicle (demo)</span>
            <select className="input" style={{ width: 'auto', height: 34 }} value={run?.vehicleId ?? ''} onChange={(e) => { setVehicle(e.target.value); localStorage.setItem('wp-driver-vehicle', e.target.value); setOpenStop(null); }}>{run?.vehicles.map((v) => <option key={v}>{v}</option>)}</select>
            <span className="tag t-ok right"><Icon name="check" size={12} />{fromCache ? 'Saved run' : 'Saved for offline'}</span></label>
        )}
        {!online && <div className="blk" style={{ background: 'var(--off-bg)', borderColor: '#C8CDD6', flexDirection: 'row', alignItems: 'flex-start' }}><Icon name="wifiOff" /><span style={{ fontSize: 14 }}><b>No signal. Keep going.</b> Everything you record is saved on this phone and sends by itself when signal returns.</span></div>}
        {!trip && <div className="blk">No published trip for your vehicle yet. The plan is published the evening before.</div>}
        {trip && <>
          <div className="col" style={{ padding: 16, background: 'var(--ink)', color: '#fff', borderRadius: 14, gap: 6 }}>
            <span className="lbl" style={{ color: '#B9B7B0' }}>Next</span>
            <span className="h" style={{ fontSize: 26, fontWeight: 800 }}>{!departed ? `Leave the depot by ${fmt(trip.startMin)}` : next ? `${next.outletId} · ETA ${fmt(next.etaMin)}` : 'Return to the depot'}</span>
            <span style={{ fontSize: 14, color: '#D9D7D0' }}>{trip.stops.length} stops in {trip.district} · {trip.km} km · back about {fmt(lastReturn)}</span>
          </div>
          <div className="blk" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Icon name="box" style={{ color: trip.sealedAt ? 'var(--ok)' : 'var(--warn)' }} />
            <div style={{ fontSize: 14 }}>{trip.sealedAt ? <><b>Loaded and sealed {slTime(trip.sealedAt)}</b> at the dock.</> : <b>Not sealed by the loader yet.</b>}
              {trip.flags.map((f) => <div key={f.id} style={{ marginTop: 4 }}><span className="tag t-bad">Flag</span> <span style={{ fontSize: 13 }}>{trip.stops.find((s) => s.id === f.stopId)?.outletId}: {f.qty} × {f.item} {f.issueType.replace('_', ' ')}. Already taken off your count.</span></div>)}</div>
          </div>
          <div className="blk" style={{ padding: '4px 14px', gap: 0 }}>
            {trip.stops.map((s) => { const st = stopStatus(s); return (
              <button key={s.id} disabled={!departed} onClick={() => { if (st === 'pending' && next && s.id !== next.id && !confirm(`${next.outletId} is next on your run. Arrive at ${s.outletId} now instead? The arrival time is recorded.`)) return; setOpenStop(s.id); }} style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 10, alignItems: 'center', padding: '10px 0', border: 0, borderBottom: '1px solid var(--line-soft)', background: 'transparent', textAlign: 'left', cursor: departed ? 'pointer' : 'default', color: 'inherit', font: 'inherit' }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid var(--ink)', display: 'grid', placeItems: 'center', font: '700 13px var(--font-head)', background: st !== 'pending' ? 'var(--ink)' : '#fff', color: st !== 'pending' ? '#fff' : 'var(--ink)' }}>{st !== 'pending' ? <Icon name="check" size={14} /> : s.seq}</span>
                <span><b className="mono">{s.outletId}</b>{local.stops.has(s.id) && <span className="tag t-off" style={{ marginLeft: 6 }}>Saved on phone</span>}<br /><span className="muted" style={{ fontSize: 13 }}>Window {s.outlet.windowOpen}–{s.outlet.windowClose} · {s.expectedUnits} units{s.shortBy ? ` (was ${s.units})` : ''}</span></span>
                <b>{st !== 'pending' ? 'Done' : fmt(s.etaMin)}</b>
              </button>); })}
          </div>
          {trip.district.match(/Nuwara Eliya|Badulla/) && <div className="row muted" style={{ fontSize: 12.5, alignItems: 'flex-start' }}><Icon name="wifiOff" size={16} /><span>Signal often drops on this route. The app works the same and sends everything later.</span></div>}
        </>}
      </main>
      {trip && <footer className="pfoot" style={{ flexDirection: 'row' }}>
        <a className="btn btn-s" style={{ minHeight: 56, width: 110 }} href={`https://www.google.com/maps/search/${encodeURIComponent(`${next?.outlet.district ?? trip.district}, Sri Lanka`)}`} target="_blank" rel="noreferrer">Maps</a>
        {!departed ? <button className="btn btn-p btn-lg grow" onClick={() => void enqueue('driver.depart', { tripId: trip.id }, planTime(run!.date, trip.startMin))}>Start trip</button>
          : next ? <button className="btn btn-p btn-lg grow" onClick={() => setOpenStop(next.id)}>Arrived at {next.outletId}</button>
          : <button className="btn btn-p btn-lg grow" disabled>All stops done</button>}
      </footer>}
    </div>
  );
}

/** Read-only view of a stop that is already done: what was recorded and whether it has been sent. */
function StopRecord({ trip, stop, saved, onBack }: { trip: TripView; stop: Stop; saved?: Record<string, unknown>; onBack: () => void }) {
  // Prefer what is still on the phone (not sent yet); otherwise what the server has.
  const r = saved ?? (stop as unknown as Record<string, unknown>);
  const outcome = String(saved ? saved.outcome : stop.status);
  const label = OUTCOMES.find(([k]) => k === outcome)?.[1] ?? outcome;
  const arrived = (saved?.arrivedAt as string | undefined) ?? (stop.arrivedAt as unknown as string | null);
  const units = r.deliveredUnits as number | null | undefined;
  return (
    <div className="phone">
      <FieldBar kicker={`Stop ${stop.seq} of ${trip.stops.length} · done`} title={<><span className="mono">{stop.outletId}</span> · {stop.outlet.district}</>} />
      <main className="pbody" style={{ gap: 10 }}>
        <button className="btn btn-sm btn-s" style={{ alignSelf: 'flex-start' }} onClick={onBack}><Icon name="back" size={14} />Run</button>
        <div className="blk" style={{ gap: 6 }}>
          <span className={`tag ${saved ? 't-off' : 't-ok'}`} style={{ alignSelf: 'flex-start' }}>{saved ? 'Saved on phone · sends when signal returns' : 'Sent to the office'}</span>
          <b className="h" style={{ fontSize: 20 }}>{label}{units != null && outcome !== 'refused' && outcome !== 'no_access' ? ` · ${units} units` : ''}</b>
          <span style={{ fontSize: 14 }}>Arrived <b>{slTime(arrived)}</b>{!saved && stop.completedAt ? <> · completed <b>{slTime(stop.completedAt)}</b></> : null}</span>
          {r.receiverName ? <span style={{ fontSize: 14 }}>Received by <b>{String(r.receiverName)}</b></span> : null}
        </div>
        {(r.signature || r.photo) ? <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          {r.signature ? <div className="blk grow" style={{ gap: 4 }}><span className="lbl">Signature</span><img src={String(r.signature)} alt="Receiver's signature" style={{ width: '100%', maxHeight: 120, objectFit: 'contain', background: '#fff' }} /></div> : null}
          {r.photo ? <div className="blk grow" style={{ gap: 4 }}><span className="lbl">Photo</span><img src={String(r.photo)} alt="Goods at the door" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8 }} /></div> : null}
        </div> : null}
        {stop.receipt && <div className="blk" style={{ fontSize: 14 }}><span className="lbl">Store</span>{stop.receipt.status === 'confirmed' ? 'The store confirmed it received everything.' : `The store reported ${String(stop.receipt.issueType ?? 'an issue').replace('_', ' ')}${stop.receipt.matchedFlagId ? ', matched to the loader\'s flag. Nothing for you to do.' : '. The dispatcher will follow up.'}`}</div>}
        <span className="muted" style={{ fontSize: 13 }}>A stop is recorded once. To change it, call the dispatcher.</span>
      </main>
    </div>
  );
}

function StopScreen({ trip, stop, date, online, pendingCount, onDone }: { trip: TripView; stop: Stop; date: string; online: boolean; pendingCount: number; onDone: (nextStopId?: string) => void }) {
  // In the demo a truck cannot reach a stop before its planned arrival, so the clock jumps there if needed.
  const [arrivedAt] = useState(() => new Date(Math.max(storyNow().getTime(), planTime(date, stop.etaMin).getTime())).toISOString());
  const [outcome, setOutcome] = useState<string>('delivered');
  const [units, setUnits] = useState(stop.expectedUnits);
  const [receiver, setReceiver] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [gps, setGps] = useState<string | null>(null);
  // Record the arrival straight away, so the phone's clock (and, once sent, everyone's) shows it.
  const arrivalSent = useRef(false);
  useEffect(() => {
    if (arrivalSent.current || stop.status !== 'pending') return;
    arrivalSent.current = true;
    void enqueue('driver.arrive', { tripId: trip.id, stopId: stop.id, arrivedAt }, new Date(arrivedAt));
  }, [arrivedAt, stop.id, stop.status, trip.id]);
  useEffect(() => { navigator.geolocation?.getCurrentPosition((p) => setGps(`${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`), () => undefined, { timeout: 5000 }); }, []);
  const arrMin = (() => { const d = new Date(arrivedAt); return d.getHours() * 60 + d.getMinutes(); })();
  const nextStop = trip.stops.find((s) => s.seq > stop.seq && s.status === 'pending');
  const valid = outcome === 'no_access' || outcome === 'refused' || (receiver.trim().length > 1 && (signature || photo));
  async function complete() {
    await enqueue('driver.stop', { tripId: trip.id, stopId: stop.id, outcome, deliveredUnits: outcome === 'delivered' ? stop.expectedUnits : outcome === 'partial' ? units : 0, receiverName: receiver || null, signature, photo, arrivedAt, gps }, new Date(new Date(arrivedAt).getTime() + Math.round(stop.predServiceMin) * 60_000));
    onDone(nextStop?.id);
  }
  return (
    <div className="phone">
      <FieldBar kicker={`Stop ${stop.seq} of ${trip.stops.length}`} title={<><span className="mono">{stop.outletId}</span> · {stop.outlet.district}</>} offlineTitle />
      {!online && <div className="row" style={{ padding: '12px 16px', background: 'var(--off-bg)', borderBottom: '1px solid #C8CDD6', fontSize: 14, alignItems: 'flex-start' }}><Icon name="sync" /><span><b>Keep going. Everything saves on this phone</b> and sends by itself when signal returns. Nothing to redo, nothing to call in.{pendingCount ? ` ${pendingCount} waiting to send.` : ''}</span></div>}
      <main className="pbody" style={{ gap: 10 }}>
        <button className="btn btn-sm btn-s" style={{ alignSelf: 'flex-start' }} onClick={() => onDone()}><Icon name="back" size={14} />Run</button>
        <div className="row" style={{ gap: 10 }}>
          <div className="blk grow" style={{ gap: 2 }}><span className="lbl">Arrived</span><b className="h" style={{ fontSize: 18 }}>{slTime(arrivedAt)}</b><span className="muted" style={{ fontSize: 12 }}>{online ? 'Automatic' : 'Phone clock'}{gps ? ' + GPS' : ''}</span></div>
          <div className="blk grow" style={{ gap: 2 }}><span className="lbl">Window</span><b className="h" style={{ fontSize: 18 }}>{stop.outlet.windowOpen}–{stop.outlet.windowClose}</b><span className="muted" style={{ fontSize: 12 }}>Planned ETA {fmt(stop.etaMin)}</span></div>
        </div>
        <div className="blk"><span className="lbl">1 · Hand over</span>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}><span>Chilled · {stop.chilledUnits} units</span><b>{stop.chilledUnits}</b></div>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}><span>Dry · {stop.units - stop.chilledUnits} units</span><b>{stop.units - stop.chilledUnits}</b></div>
          {stop.shortBy > 0 && <div className="row" style={{ justifyContent: 'space-between', fontSize: 14, color: 'var(--bad)' }}><span>Flagged at the dock</span><b>−{stop.shortBy}</b></div>}
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 14, borderTop: '1px solid var(--line-soft)', paddingTop: 6 }}><b>To hand over</b><b>{stop.expectedUnits}</b></div>
        </div>
        <div className="col"><span className="lbl">2 · Outcome</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>{OUTCOMES.map(([k, l]) => <button key={k} className={`opt ${outcome === k ? 'on' : ''}`} aria-pressed={outcome === k} onClick={() => setOutcome(k)}>{l}</button>)}</div>
          {outcome === 'partial' && <div className="row"><span className="grow">Units handed over</span><div className="stepper"><button onClick={() => setUnits(Math.max(0, units - 1))} aria-label="Fewer">−</button><span>{units}</span><button onClick={() => setUnits(Math.min(stop.expectedUnits, units + 1))} aria-label="More">+</button></div></div>}
        </div>
        {(outcome === 'delivered' || outcome === 'partial') && <div className="blk"><span className="lbl">3 · Proof</span>
          <label className="col" style={{ gap: 4, fontSize: 13 }}><span className="muted">Received by</span><input className="input" style={{ height: 44 }} placeholder="Name of store staff" value={receiver} onChange={(e) => setReceiver(e.target.value)} /></label>
          <SignaturePad onChange={setSignature} />
          <label className="row" style={{ cursor: 'pointer', fontSize: 14 }}>
            {photo ? <img src={photo} alt="Delivery photo" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} /> : <span style={{ width: 56, height: 56, borderRadius: 8, background: '#D9D6CD', display: 'grid', placeItems: 'center' }}><Icon name="camera" /></span>}
            <span><b>{photo ? 'Photo added' : 'Photo of goods at the door'}</b><br /><span className="muted" style={{ fontSize: 12.5 }}>Compressed to save data</span></span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await compressPhoto(f)); }} />
          </label>
        </div>}
        {arrMin > 0 && <span className="muted" style={{ fontSize: 12 }}>Records keep their own time and position, so the order they reach the office does not matter.</span>}
      </main>
      <footer className="pfoot">
        <button className="btn btn-p btn-lg" disabled={!valid} onClick={complete}>{online ? `Complete stop ${stop.seq}` : `Save stop ${stop.seq}`}{nextStop ? ` · next ${nextStop.outletId}` : ''}</button>
        {!valid && <span className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>Add the receiver’s name and a signature or photo</span>}
      </footer>
    </div>
  );
}

function SyncReport({ report, trip, onDone }: { report: NonNullable<ReturnType<typeof useOutbox>['report']>; trip?: TripView; onDone: () => void }) {
  const stops = report.events.filter((e) => e.kind === 'driver.stop');
  const matched = stops.map((e) => e.result?.matched).filter(Boolean) as string[];
  return (
    <div className="phone">
      <FieldBar kicker={`${trip?.vehicleId ?? ''} · back in coverage`} title="Back online" />
      <main className="pbody">
        <div className="row" style={{ padding: 16, background: 'var(--ink)', color: '#fff', borderRadius: 14, gap: 12 }}>
          <span style={{ width: 44, height: 44, borderRadius: '50%', background: '#2E8A57', display: 'grid', placeItems: 'center' }}><Icon name="check" size={24} /></span>
          <div><div className="h" style={{ fontSize: 19, fontWeight: 700 }}>All {stops.length} stop{stops.length > 1 ? 's' : ''} sent. Nothing lost.</div><div style={{ fontSize: 13, color: '#D9D7D0' }}>{stops.filter((e) => e.payload.photo).length} photos, {stops.filter((e) => e.payload.signature).length} signatures</div></div>
        </div>
        <div className="blk" style={{ gap: 0 }}><span className="lbl" style={{ paddingBottom: 4 }}>Recorded offline → sent now</span>
          {stops.map((e) => { const s = trip?.stops.find((x) => x.id === e.payload.stopId); return (
            <div key={e.id} className="row" style={{ padding: '9px 0', borderTop: '1px solid var(--line-soft)', alignItems: 'flex-start' }}>
              <Icon name={e.result?.status === 'rejected' ? 'alert' : 'check'} style={{ color: e.result?.status === 'rejected' ? 'var(--bad)' : 'var(--ok)' }} />
              <span className="grow"><b>Stop {s?.seq ?? ''} · <span className="mono">{s?.outletId ?? ''}</span></b><br /><span className="muted" style={{ fontSize: 13 }}>{String(e.payload.outcome).replace('_', ' ')}{e.payload.deliveredUnits != null ? `, ${e.payload.deliveredUnits} units` : ''}{e.result?.status === 'rejected' ? ` — ${e.result.message}` : ''}</span></span>
              <span className="muted" style={{ fontSize: 13, textAlign: 'right' }}>{slTime(e.at)}<br />→ {slTime(report.at)}</span>
            </div>); })}
        </div>
        {matched.map((m, i) => <div key={i} className="blk" style={{ background: '#FFF8EC', borderColor: '#E8C98A' }}><div className="row"><span className="tag t-warn">Matched automatically</span><span className="muted" style={{ fontSize: 12 }}>no action for you</span></div><span style={{ fontSize: 14 }}>{m}</span></div>)}
        <div className="row muted" style={{ fontSize: 13.5 }}><Icon name="check" size={16} /><span>No plan changes were made while you were offline.</span></div>
      </main>
      <footer className="pfoot"><button className="btn btn-p btn-lg" onClick={onDone}>Continue</button></footer>
    </div>
  );
}
