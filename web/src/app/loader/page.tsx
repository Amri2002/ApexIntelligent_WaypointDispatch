'use client';
// L1 · Dock departures — trucks in departure order; plan changes pinned at the top instead of a phone call.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FieldBar } from '@/components/FieldBar';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/client/api';
import { cached, useOutbox } from '@/lib/client/outbox';
import type { TripView } from '@/lib/opsService';
import { fmt, prettyDate, slTime } from '@/lib/time';

interface Deps { depot: string; date: string; trips: TripView[]; notes: { id: string; title: string; body: string; createdAt: string }[] }

export default function LoaderHome() {
  const [depot, setDepot] = useState<'Kandy' | 'Peliyagoda'>('Kandy');
  const [data, setData] = useState<Deps | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);
  const { pending } = useOutbox();
  useEffect(() => { const d = localStorage.getItem('wp-loader-depot'); if (d === 'Peliyagoda' || d === 'Kandy') setDepot(d); setSeen(localStorage.getItem('wp-loader-seen')); }, []);
  const load = useCallback(async () => { const r = await cached(`loader:${depot}`, () => api<Deps>(`/api/loader/departures?depot=${depot}`)); setData(r.data); setFromCache(r.fromCache); }, [depot]);
  useEffect(() => { void load(); }, [load, pending.length]);

  const note = data?.notes[0];
  const loadedCount = (t: TripView) => t.stops.filter((s) => s.loaded).length + pending.filter((e) => e.kind === 'loader.check' && e.payload.tripId === t.id && e.payload.loaded).length;
  return (
    <div className="phone">
      <FieldBar kicker={`${depot} hub · Dock 3`} title={`Departures · ${data ? prettyDate(data.date) : ''}`} />
      <main className="pbody">
        <div className="seg" role="group" aria-label="Depot" style={{ alignSelf: 'flex-start' }}>{(['Kandy', 'Peliyagoda'] as const).map((d) => <button key={d} className={depot === d ? 'on' : ''} onClick={() => { setDepot(d); localStorage.setItem('wp-loader-depot', d); }}>{d}</button>)}</div>
        {fromCache && <div className="blk" style={{ background: 'var(--off-bg)', fontSize: 13.5 }}>Showing the list saved on this device. Changes will appear when the signal returns.</div>}
        {note && note.id !== seen && (
          <div className="banner" style={{ background: 'var(--ink)', color: '#fff', alignItems: 'flex-start' }}>
            <Icon name="sync" style={{ color: 'var(--brand)' }} />
            <div className="col" style={{ gap: 6, fontSize: 14 }}><span><b>{note.title}</b> · {slTime(note.createdAt)}. {note.body} Your list below is already up to date.</span>
              <button className="btn btn-sm" style={{ alignSelf: 'flex-start', border: '1px solid #5B5F68', background: 'transparent', color: '#fff' }} onClick={() => { setSeen(note.id); localStorage.setItem('wp-loader-seen', note.id); }}>Got it</button></div>
          </div>
        )}
        {!data?.trips.length && <div className="blk">No published trips yet for {depot}. The dispatcher publishes the plan the evening before.</div>}
        {data?.trips.length ? <div className="lbl">Next out</div> : null}
        {data?.trips.map((t) => {
          const n = loadedCount(t);
          const sealed = t.status !== 'planned' && t.status !== 'loading';
          return (
            <Link key={t.id} href={`/loader/trip/${t.id}`} className="blk" style={{ textDecoration: 'none', color: 'inherit', border: sealed ? undefined : n ? '2px solid var(--ink)' : undefined }}>
              <div className="row"><b className="mono" style={{ fontSize: 16 }}>{t.vehicleId}</b><span className={`tag ${t.vehicle.temp === 'reefer' ? 't-chill' : ''}`}>{t.vehicle.temp === 'reefer' ? 'Reefer' : 'Ambient'} {t.vehicle.type}</span><span className="tag">Trip {t.tripNo}</span><b className="right">{fmt(t.startMin)}</b></div>
              <div style={{ fontSize: 14 }}>{t.district} · {t.brand} · {t.stops.length} stops · {t.loadM3.toFixed(1)} m³ · {Math.round(t.loadKg).toLocaleString()} kg</div>
              {sealed ? <div><span className="tag t-ok">Loaded and sealed {slTime(t.sealedAt)}{t.flags.length ? ` · ${t.flags.length} flag` : ' · no flags'}</span></div>
                : <div className="row" style={{ fontSize: 13 }}><span className="meter grow"><span style={{ width: `${(n / t.stops.length) * 100}%` }} /></span><b>{n} of {t.stops.length} loaded</b><Icon name="next" /></div>}
            </Link>
          );
        })}
      </main>
    </div>
  );
}
