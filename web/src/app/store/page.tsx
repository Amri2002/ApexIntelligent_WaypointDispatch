'use client';
// M2 · Expected arrival, G4 · Deferral notice, M3 · Confirm receipt — the store manager's day in one screen.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { api, logout } from '@/lib/client/api';
import { compressPhoto } from '@/lib/client/image';
import { fmt, prettyDate, slTime } from '@/lib/time';

interface Note { id: string; kind: string; title: string; body: string; createdAt: string; response: string | null }
interface Ord { id: string; ref: string; temp: string; units: number; status: string; deliveryDate: string; stopId: string | null; volumeM3: number; createdAt: string }
interface Delivery { trip: { id: string; vehicleId: string; tripNo: number; status: string; sealedAt: string | null; departedAt: string | null; lastSyncAt: string | null; isOffline: boolean; stopsTotal: number; stopsDone: number; flags: { id: string; qty: number; item: string; issueType: string }[] }; stop: { id: string; seq: number; etaMin: number; status: string; completedAt: string | null; receiverName: string | null; photo: string | null; deliveredUnits: number | null; units: number; chilledUnits: number; expectedUnits: number; lateRisk: number; receipt: { status: string; issueType: string | null; matchedFlagId: string | null } | null; orders: Ord[] } ; arrival: { earliest: number; likely: number; latest: number } }
interface Overview { outlet: { id: string; brand: string; district: string; windowOpen: string; windowClose: string; dockType: string }; date: string; nextDate: string; orders: Ord[]; deliveries: Delivery[]; notes: Note[]; outlets: { id: string; brand: string; district: string }[] }

export default function StorePage() {
  const [outlet, setOutlet] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [here, setHere] = useState(false);
  useEffect(() => { setOutlet(localStorage.getItem('wp-store-outlet')); }, []);
  const load = useCallback(() => api<Overview>(`/api/store/overview${outlet ? `?outlet=${outlet}` : ''}`).then(setData), [outlet]);
  useEffect(() => { void load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  if (!data) return <div className="phone"><main className="pbody">Loading…</main></div>;
  const deferrals = data.notes.filter((n) => n.kind === 'deferral');
  const requests = data.notes.filter((n) => n.kind === 'window_request' && !n.response);
  const flags = data.notes.filter((n) => n.kind === 'flag');
  const changes = data.notes.filter((n) => n.kind === 'plan_change');
  const today = data.deliveries[0];
  const nextOrders = data.orders.filter((o) => o.deliveryDate > data.date);

  return (
    <div className="phone">
      <header className="appbar">
        <div className="col" style={{ gap: 0 }}><span className="lbl">Waypoint {data.outlet.brand} · <span className="mono">{data.outlet.id}</span> · {data.outlet.district}</span><span className="h" style={{ fontSize: 18, fontWeight: 700 }}>Deliveries</span></div>
        <button className="right" onClick={logout} aria-label="Sign out" style={{ border: 0, background: 'transparent', cursor: 'pointer' }}><Icon name="logout" /></button>
      </header>
      <main className="pbody">
        {data.outlets.length > 1 && (
        <label className="row" style={{ fontSize: 13 }}><span className="muted">Outlet (demo)</span>
          <select className="input" style={{ width: 'auto', height: 34 }} value={data.outlet.id} onChange={(e) => { setOutlet(e.target.value); localStorage.setItem('wp-store-outlet', e.target.value); }}>{data.outlets.map((o) => <option key={o.id} value={o.id}>{o.id} · {o.brand} · {o.district}</option>)}</select></label>
        )}

        {requests.map((n) => <WindowRequest key={n.id} note={n} outlet={data.outlet.id} onDone={(m) => { setMsg(m); void load(); }} />)}
        {deferrals.map((n) => <DeferralNotice key={n.id} note={n} outlet={data.outlet.id} onDone={() => void load()} />)}

        {today ? <Arrival d={today} outlet={data.outlet} /> : <div className="blk"><span className="lbl">Today · {prettyDate(data.date)}</span><span>{data.orders.some((o) => o.deliveryDate === data.date && o.status === 'deferred') ? 'Your order for today was moved — see the notice above.' : 'No delivery on the published plan for today yet.'}</span></div>}
        {changes.map((n) => <div key={n.id} className="blk" style={{ background: '#EEF4FA', borderColor: '#BFD3E6' }}><span className="tag" style={{ alignSelf: 'flex-start' }}>Plan changed · {slTime(n.createdAt)}</span><b>{n.title}</b><span style={{ fontSize: 13.5 }}>{n.body}</span></div>)}
        {flags.map((n) => <div key={n.id} className="blk" style={{ background: '#FFF8EC', borderColor: '#E8C98A' }}><span className="tag t-warn" style={{ alignSelf: 'flex-start' }}>From the dock · {slTime(n.createdAt)}</span><b>{n.title}</b><span style={{ fontSize: 13.5 }}>{n.body}</span></div>)}
        {today && (today.stop.status !== 'pending' || here || today.stop.receipt) && <Receipt d={today} outlet={data.outlet.id} onDone={(m) => { setMsg(m); void load(); }} />}
        {today && today.stop.status === 'pending' && !here && !today.stop.receipt && <button className="btn btn-p btn-lg" onClick={() => setHere(true)}>The truck is here</button>}

        <div className="blk"><div className="row"><span className="lbl">Upcoming orders</span><Link className="right" href="/store/order" style={{ fontWeight: 600 }}>Place order</Link></div>
          {nextOrders.length ? nextOrders.map((o) => <div key={o.id} className="row" style={{ fontSize: 13.5, borderTop: '1px solid var(--line-soft)', paddingTop: 6 }}><Icon name="check" size={16} style={{ color: 'var(--ok)' }} /><span className="mono">{o.ref}</span><span className="muted">{prettyDate(o.deliveryDate, { weekday: 'short', day: 'numeric', month: 'short' })} · {o.temp} · {o.units} units</span>{o.ref.endsWith('-D') && <span className="tag t-warn right">Moved from today · first in line</span>}</div>) : <span className="muted" style={{ fontSize: 13.5 }}>Nothing ordered yet. Orders close at 16:00 the day before.</span>}
        </div>
      </main>
      {msg && <div className="toast" role="status" onAnimationEnd={() => setMsg(null)} onClick={() => setMsg(null)}>{msg}</div>}
    </div>
  );
}

function Arrival({ d, outlet }: { d: Delivery; outlet: Overview['outlet'] }) {
  const done = d.stop.status !== 'pending';
  // Likely arrival = planned ETA + how late trucks have actually run at this stop position and season.
  const a = d.arrival;
  const events = [
    { on: true, t: 'Order confirmed', at: '' },
    { on: !!d.trip.sealedAt, t: d.trip.flags.length ? `Loaded and sealed · ${d.trip.flags.reduce((a, f) => a + f.qty, 0)} short (flagged at the dock)` : 'Loaded and sealed · nothing short for you', at: slTime(d.trip.sealedAt) },
    { on: !!d.trip.departedAt, t: 'Left the depot', at: slTime(d.trip.departedAt) },
    { on: d.trip.stopsDone > 0, t: `Stop ${d.trip.stopsDone} of ${d.trip.stopsTotal} delivered`, at: slTime(d.trip.lastSyncAt) },
  ];
  return (
    <>
      <div className="col" style={{ padding: 18, background: '#fff', border: '2px solid var(--ink)', borderRadius: 14, gap: 4 }}>
        <span className="lbl">{done ? 'Delivered to your' : 'Expected at your'} {outlet.dockType === 'rear_dock' ? 'rear dock' : outlet.dockType === 'mall_bay' ? 'mall bay' : 'street entrance'}</span>
        <span className="h" style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>{done ? slTime(d.stop.completedAt) : fmt(a.likely)}</span>
        {!done && <span style={{ fontSize: 14 }}>Likely between <b>{fmt(a.earliest)} and {fmt(a.latest)}</b> · planned {fmt(d.stop.etaMin)} · your window {outlet.windowOpen}–{outlet.windowClose}</span>}
        <span className="muted" style={{ fontSize: 13 }}>Stop {d.stop.seq} of {d.trip.stopsTotal} on {d.trip.vehicleId} · {d.stop.expectedUnits} units ({d.stop.chilledUnits} chilled)</span>
      </div>
      {!done && a.likely > Number(outlet.windowClose.slice(0, 2)) * 60 + Number(outlet.windowClose.slice(3, 5)) && (
        <div className="blk" role="alert" style={{ background: 'var(--bad-bg)', borderColor: '#F0B9B2', flexDirection: 'row', alignItems: 'flex-start' }}>
          <Icon name="alert" style={{ color: 'var(--bad)' }} />
          <span style={{ fontSize: 14 }}><b>Likely after your window closes at {outlet.windowClose}.</b> On days like this, trucks at this point in the route usually run late. The dispatcher sees the same risk; please keep a receiver on until the truck arrives.</span>
        </div>
      )}
      {!done && <div className="blk" style={{ background: '#FFF8EC', borderColor: '#E8C98A', flexDirection: 'row', alignItems: 'flex-start' }}><Icon name="clock" style={{ color: 'var(--warn)' }} /><span style={{ fontSize: 14 }}><b>Receiving staff needed from {fmt(a.earliest - 15)}.</b> This updates as the truck reports in.</span></div>}
      <div className="blk" style={{ gap: 0 }}>
        {events.map((e, i) => <div key={i} className="row" style={{ padding: '7px 0', alignItems: 'flex-start' }}><span className={`dot ${e.on ? '' : 'o'}`} /><span className="grow" style={{ fontSize: 14, color: e.on ? undefined : 'var(--muted)' }}>{e.t}</span><span className="muted" style={{ fontSize: 13 }}>{e.on ? e.at : ''}</span></div>)}
        {d.trip.isOffline && !done && <div className="row" style={{ padding: '7px 0', alignItems: 'flex-start' }}><span className="dot p" /><span className="grow" style={{ fontSize: 14 }}><span className="tag t-off">Low coverage</span><br />The truck is in an area without signal. Times since {slTime(d.trip.lastSyncAt)} are estimated from the plan.</span><span className="muted" style={{ fontSize: 13 }}>now</span></div>}
        <div className="row" style={{ padding: '7px 0' }}><span className={`dot ${done ? '' : 'o'}`} /><b className="grow" style={{ fontSize: 14 }}>{done ? 'Delivered' : 'Arrives at your store'}</b><b>{done ? slTime(d.stop.completedAt) : `~${fmt(a.likely)}`}</b></div>
      </div>
    </>
  );
}

function DeferralNotice({ note, outlet, onDone }: { note: Note; outlet: string; onDone: () => void }) {
  const b = JSON.parse(note.body) as { orderRef: string; units: number; temp: string; from: string; to: string; reason: string; decidedBy: string; outletWindow: string };
  const [busy, setBusy] = useState(false);
  const send = async (impact: string) => { setBusy(true); await api(`/api/store/requests/${note.id}`, { json: { impact, outletId: outlet } }); setBusy(false); onDone(); };
  return (
    <div className="col" style={{ padding: 16, background: '#fff', border: '2px solid var(--bad)', borderRadius: 14, gap: 8 }}>
      <span className="tag t-bad" style={{ alignSelf: 'flex-start' }}>{b.temp === 'chilled' ? 'Chilled' : 'Order'} moved · {slTime(note.createdAt)}</span>
      <span className="h" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>Your {b.temp} order arrives <u>{prettyDate(b.to, { weekday: 'long' })}</u>, not {prettyDate(b.from, { weekday: 'long' })}</span>
      <span style={{ fontSize: 14 }}>{b.reason}. Your order is <b>first in line</b> on {prettyDate(b.to)}: it is planned before any new orders, and moving it again needs a written reason from the dispatcher.</span>
      <div style={{ fontSize: 13.5, borderTop: '1px solid var(--line-soft)', paddingTop: 8 }} className="col">
        <span><span className="muted">Order</span> <span className="mono">{b.orderRef}</span> · {b.units} units</span>
        <span><span className="muted">New arrival</span> <b>{prettyDate(b.to)} · first wave</b> · your window {b.outletWindow}</span>
        <span><span className="muted">Decided by</span> {b.decidedBy}, dispatcher</span>
      </div>
      {note.response ? <span className="tag t-ok" style={{ alignSelf: 'flex-start' }}>You told the dispatcher: {note.response}</span> : <>
        <span className="lbl">Will this hurt your store? Tell the dispatcher</span>
        <div className="row" style={{ flexWrap: 'wrap' }}>{['Chiller will be empty', 'Festival promotion affected', 'We can manage'].map((x) => <button key={x} className="btn btn-s" style={{ borderRadius: 999 }} disabled={busy} onClick={() => send(x)}>{x}</button>)}</div>
      </>}
    </div>
  );
}

function WindowRequest({ note, outlet, onDone }: { note: Note; outlet: string; onDone: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const answer = async (accept: boolean) => { setBusy(true); const r = await api<{ placed: boolean }>(`/api/store/requests/${note.id}`, { json: { accept, outletId: outlet } }); setBusy(false); onDone(r.placed ? 'Thanks — your order is back on the truck.' : 'Noted — your order moves to the next run.'); };
  return (
    <div className="col" style={{ padding: 16, background: '#fff', border: '2px solid var(--chill)', borderRadius: 14, gap: 8 }}>
      <span className="tag t-chill" style={{ alignSelf: 'flex-start' }}>Question from the dispatcher</span>
      <span className="h" style={{ fontSize: 20, fontWeight: 800 }}>{note.title}</span>
      <span style={{ fontSize: 14 }}>{note.body}</span>
      <div className="row"><button className="btn btn-p grow" disabled={busy} onClick={() => answer(true)}>Yes, we can</button><button className="btn btn-s grow" disabled={busy} onClick={() => answer(false)}>No</button></div>
    </div>
  );
}

function Receipt({ d, outlet, onDone }: { d: Delivery; outlet: string; onDone: (m: string) => void }) {
  const [issue, setIssue] = useState(false);
  const [type, setType] = useState('missing');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const r = d.stop.receipt;
  const send = async (status: 'confirmed' | 'issue') => {
    const res = await api<{ matched: boolean }>('/api/store/receipts', { json: { outletId: outlet, stopId: d.stop.id, status, issueType: status === 'issue' ? type : undefined, qty: status === 'issue' ? qty : undefined, note: note || undefined, photo: photo || undefined } });
    onDone(status === 'confirmed' ? 'Receipt confirmed — thank you.' : res.matched ? 'Reported. It matches the loader’s flag; a replacement is on the next run.' : 'Reported to the dispatcher with the driver’s proof.');
  };
  return (
    <div className="blk">
      <div className="row"><span className="lbl">Confirm what arrived</span>{r && <span className={`tag right ${r.status === 'confirmed' ? 't-ok' : 't-warn'}`}>{r.status === 'confirmed' ? 'Confirmed' : `Issue reported${r.matchedFlagId ? ' · matches dock flag' : ''}`}</span>}</div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        {d.stop.status === 'pending' && <span style={{ fontSize: 13.5 }} className="muted">The driver’s record has not reached us yet (no signal on the route). You can still confirm or report now; it will be matched when it arrives.</span>}
        {d.stop.status !== 'pending' && (d.stop.photo ? <img src={d.stop.photo} alt="Driver's delivery photo" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} /> : <span style={{ width: 56, height: 56, borderRadius: 8, background: '#D9D6CD', display: 'grid', placeItems: 'center' }}><Icon name="camera" /></span>)}
        {d.stop.status !== 'pending' && <span style={{ fontSize: 14 }}><b>Driver recorded: {d.stop.status.replace('_', ' ')}{d.stop.deliveredUnits != null ? `, ${d.stop.deliveredUnits} units` : ''}</b><br /><span className="muted" style={{ fontSize: 13 }}>{slTime(d.stop.completedAt)}{d.stop.receiverName ? ` · received by ${d.stop.receiverName}` : ''}</span></span>}
      </div>
      {!r && !issue && <><button className="btn btn-p btn-lg" onClick={() => send('confirmed')}>Confirm all received</button><button className="btn btn-s" onClick={() => setIssue(true)}>Report an issue</button></>}
      {!r && issue && <div className="col">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>{[['missing', 'Missing'], ['damaged', 'Damaged'], ['wrong_temperature', 'Wrong temperature'], ['wrong_item', 'Wrong item']].map(([k, l]) => <button key={k} className={`opt ${type === k ? 'on' : ''}`} onClick={() => setType(k)}>{l}</button>)}</div>
        <div className="row"><span className="grow">How many units</span><div className="stepper"><button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Fewer">−</button><span>{qty}</span><button onClick={() => setQty(qty + 1)} aria-label="More">+</button></div></div>
        <input className="input" placeholder="What happened (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <label className="btn btn-s"><Icon name="camera" />{photo ? 'Photo added' : 'Add a photo'}<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await compressPhoto(f)); }} /></label>
        <button className="btn btn-w btn-lg" onClick={() => send('issue')}>Send report</button>
      </div>}
    </div>
  );
}
