'use client';
// L2 · Load sequence (last stop first) and L3 · Flag a shortfall. Works without Wi-Fi: every tick and flag is saved on the device first.
import { useCallback, useEffect, useMemo, useState, use } from 'react';
import { FieldBar } from '@/components/FieldBar';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/client/api';
import { cached, enqueue, useOutbox } from '@/lib/client/outbox';
import { compressPhoto } from '@/lib/client/image';
import type { TripView } from '@/lib/opsService';
import { fmt, DEMO_DATE } from '@/lib/time';
import { planTime } from '@/lib/client/clock';

// In the demo, loading starts about 40 minutes before the planned departure.
const loadingTime = (t: TripView) => planTime(DEMO_DATE, t.startMin - 40);

const ISSUES = [['missing', 'Missing'], ['damaged', 'Damaged'], ['short_picked', 'Short-picked'], ['wrong_temperature', 'Wrong temperature']] as const;
const ITEMS = ['Yoghurt 80 g × 24 (carton)', 'Fresh milk 1 L (crate)', 'Butter 200 g (case)', 'Cheese slices (case)', 'Dry goods carton', 'Other item'];

export default function LoadTrip({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [trip, setTrip] = useState<TripView | null>(null);
  const [flagFor, setFlagFor] = useState<TripView['stops'][number] | null>(null);
  const { pending } = useOutbox();
  const load = useCallback(async () => { const r = await cached(`loader-trip:${id}`, () => api<TripView>(`/api/loader/trips/${id}`)); if (r.data) setTrip(r.data); }, [id]);
  useEffect(() => { void load(); }, [load, pending.length]);

  // Apply events still waiting on the device so the screen reflects what the loader did.
  const local = useMemo(() => {
    const loaded = new Map<string, boolean>(); const flagged = new Map<string, number>(); let sealed = false;
    for (const e of pending) {
      if (e.payload.tripId !== id) continue;
      if (e.kind === 'loader.check') loaded.set(String(e.payload.stopId), !!e.payload.loaded);
      if (e.kind === 'loader.flag') { flagged.set(String(e.payload.stopId), (flagged.get(String(e.payload.stopId)) ?? 0) + Number(e.payload.qty)); loaded.set(String(e.payload.stopId), true); }
      if (e.kind === 'loader.seal') sealed = true;
    }
    return { loaded, flagged, sealed };
  }, [pending, id]);

  if (!trip) return <div className="phone"><FieldBar kicker="Loading" title="Trip" back="/loader" /><main className="pbody"><div className="blk">Loading…</div></main></div>;
  const stops = [...trip.stops].sort((a, b) => b.seq - a.seq); // last stop first
  const isLoaded = (s: TripView['stops'][number]) => local.loaded.get(s.id) ?? s.loaded;
  const flagQty = (s: TripView['stops'][number]) => trip.flags.filter((f) => f.stopId === s.id).reduce((a, f) => a + f.qty, 0) + (local.flagged.get(s.id) ?? 0);
  const done = stops.filter(isLoaded).length;
  const sealed = local.sealed || ['sealed', 'departed', 'completed'].includes(trip.status);
  const loadedM3 = stops.filter(isLoaded).reduce((a, s) => a + s.volumeM3, 0);
  const firstOpen = stops.find((s) => !isLoaded(s))?.id;

  return (
    <div className="phone">
      <FieldBar kicker={`Departs ${fmt(trip.startMin)} · ${trip.district}`} title={`${trip.vehicleId} · Trip ${trip.tripNo}`} back="/loader" />
      <main className="pbody" style={{ gap: 10 }}>
        <div className="col" style={{ gap: 6 }}>
          <div className="row muted" style={{ justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}><span>CAB END · load first</span><span>DOORS · load last</span></div>
          <div style={{ display: 'flex', height: 40, borderRadius: 8, overflow: 'hidden', border: '2px solid var(--ink)' }}>
            {stops.map((s) => <div key={s.id} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 13px var(--font-mono)', borderRight: '2px solid #fff', background: flagQty(s) ? 'var(--bad-bg)' : isLoaded(s) ? 'var(--ink)' : 'var(--ground)', color: flagQty(s) ? 'var(--bad)' : isLoaded(s) ? '#fff' : 'var(--ink)' }}>{s.seq}</div>)}
          </div>
          <div style={{ fontSize: 12.5 }}><b>{loadedM3.toFixed(1)} of {trip.loadM3.toFixed(1)} m³</b> loaded · trip uses {Math.round((trip.loadM3 / trip.vehicle.volumeCapM3) * 100)}% of {trip.vehicle.volumeCapM3} m³, {Math.round((trip.loadKg / trip.vehicle.weightCapKg) * 100)}% of {trip.vehicle.weightCapKg.toLocaleString()} kg</div>
        </div>
        <div className="blk" style={{ fontSize: 13.5 }}>Load <b>stop {stops[0]?.seq} first</b> and <b>stop 1 last</b>, by the doors, so the driver never digs past other stores’ goods.</div>
        {stops.map((s, i) => {
          const fq = flagQty(s); const on = isLoaded(s);
          return (
            <div key={s.id} className="lrow" style={{ border: fq ? '1px solid var(--bad)' : s.id === firstOpen ? '2px solid var(--ink)' : undefined }}>
              <span className="h" style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', width: 34, textAlign: 'center' }}>{['1st', '2nd', '3rd'][i] ?? `${i + 1}th`}</span>
              <div className="col grow" style={{ gap: 3 }}>
                <b>Stop {s.seq} · <span className="mono">{s.outletId}</span></b>
                <span className="muted" style={{ fontSize: 13 }}>{s.units} units · {s.volumeM3} m³{s.chilledUnits ? ` · ${s.chilledUnits} chilled, ${s.units - s.chilledUnits} dry` : ''}</span>
                {fq > 0 && <span className="tag t-bad" style={{ alignSelf: 'flex-start' }}>Flagged: {fq} short</span>}
                {!sealed && <button className="btn btn-sm btn-s" style={{ alignSelf: 'flex-start' }} onClick={() => setFlagFor(s)}><Icon name="alert" size={14} />Flag a problem</button>}
              </div>
              <button className={`ck ${fq ? 'fl' : on ? 'on' : ''}`} role="checkbox" aria-checked={on} aria-label={`Stop ${s.seq} loaded`} disabled={sealed}
                onClick={() => void enqueue('loader.check', { tripId: trip.id, stopId: s.id, loaded: !on }, loadingTime(trip))}>
                {fq ? <Icon name="alert" size={24} /> : on ? <Icon name="check" size={26} /> : null}
              </button>
            </div>
          );
        })}
      </main>
      <footer className="pfoot">
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}><span><b>{done} of {stops.length} loaded</b>{trip.flags.length + local.flagged.size ? ` · ${trip.flags.length + local.flagged.size} flag` : ''}</span><span className="muted">Works without Wi-Fi</span></div>
        <button className="btn btn-p btn-lg" disabled={sealed || done < stops.length} onClick={() => void enqueue('loader.seal', { tripId: trip.id }, loadingTime(trip))}>
          {sealed ? <><Icon name="check" />Sealed and handed over</> : done < stops.length ? `Seal and hand over · ${stops.length - done} stop${stops.length - done > 1 ? 's' : ''} left` : 'Seal and hand over to the driver'}
        </button>
      </footer>
      {flagFor && <FlagSheet trip={trip} stop={flagFor} onClose={() => setFlagFor(null)} />}
    </div>
  );
}

function FlagSheet({ trip, stop, onClose }: { trip: TripView; stop: TripView['stops'][number]; onClose: () => void }) {
  const [item, setItem] = useState(stop.chilledUnits ? ITEMS[0] : ITEMS[4]);
  const [issue, setIssue] = useState<string>('damaged');
  const [qty, setQty] = useState(1);
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState('');
  return (
    <div role="dialog" aria-label="Flag a problem" style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'var(--ground)', overflow: 'auto' }}>
      <div className="phone">
        <header className="appbar">
          <button onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, border: 0, background: 'transparent', marginLeft: -10 }}><Icon name="close" size={20} /></button>
          <div className="col" style={{ gap: 0 }}><span className="lbl">{trip.vehicleId} · Stop {stop.seq} · {stop.outletId}</span><span className="h" style={{ fontSize: 18, fontWeight: 700 }}>Flag a problem</span></div>
        </header>
        <main className="pbody" style={{ gap: 14 }}>
          <label className="col" style={{ gap: 8 }}><span className="lbl">1 · Which item</span>
            <select className="input" style={{ height: 52, fontWeight: 600 }} value={item} onChange={(e) => setItem(e.target.value)}>{ITEMS.map((x) => <option key={x}>{x}</option>)}</select></label>
          <div className="col"><span className="lbl">2 · What is wrong</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>{ISSUES.map(([k, l]) => <button key={k} className={`opt ${issue === k ? 'on' : ''}`} aria-pressed={issue === k} onClick={() => setIssue(k)}>{l}</button>)}</div></div>
          <div className="row"><div className="grow"><span className="lbl">3 · How many</span><div className="muted" style={{ fontSize: 13 }}>Taken off the driver’s count</div></div>
            <div className="stepper"><button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Fewer">−</button><span>{qty}</span><button onClick={() => setQty(qty + 1)} aria-label="More">+</button></div></div>
          <label className="blk" style={{ flexDirection: 'row', alignItems: 'center', cursor: 'pointer' }}>
            {photo ? <img src={photo} alt="Flag photo" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} /> : <span style={{ width: 64, height: 64, borderRadius: 8, background: '#D9D6CD', display: 'grid', placeItems: 'center' }}><Icon name="camera" size={26} /></span>}
            <span className="grow"><b>{photo ? '1 photo added' : 'Add a photo'}</b><br /><span className="muted" style={{ fontSize: 13 }}>Evidence that settles any later claim</span></span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await compressPhoto(f)); }} />
          </label>
          <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="blk"><span className="lbl">When you send</span>
            <div className="row" style={{ fontSize: 13.5, alignItems: 'flex-start' }}><Icon name="truck" /><span>The driver’s count for {stop.outletId} drops by {qty}, so the store cannot hold him to it</span></div>
            <div className="row" style={{ fontSize: 13.5, alignItems: 'flex-start' }}><Icon name="pin" /><span>The dispatcher sees it on the live board</span></div>
            <div className="row" style={{ fontSize: 13.5, alignItems: 'flex-start' }}><Icon name="store" /><span>The store is told before the truck arrives</span></div>
          </div>
        </main>
        <footer className="pfoot"><button className="btn btn-w btn-lg" onClick={async () => { await enqueue('loader.flag', { tripId: trip.id, stopId: stop.id, item, issueType: issue, qty, note: note || undefined, photo: photo || undefined }, loadingTime(trip)); onClose(); }}>Send flag</button></footer>
      </div>
    </div>
  );
}
