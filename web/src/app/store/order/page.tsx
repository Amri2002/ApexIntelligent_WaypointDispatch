'use client';
// M1 · Place order — the deadline first, and a reference number the moment the order is sent.
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/client/api';
import { prettyDate } from '@/lib/time';

type Cat = Record<string, { name: string; pack: string; temp: 'chilled' | 'ambient'; kg: number; m3: number }>;
const DEFAULTS: Record<string, number> = { milk: 10, yoghurt: 12, cheese: 4, butter: 8, rice: 6, flour: 4, tea: 3, biscuits: 6 };

export default function OrderPage() {
  const [cat, setCat] = useState<Cat | null>(null);
  const [tab, setTab] = useState<'chilled' | 'ambient'>('chilled');
  const [qty, setQty] = useState<Record<string, number>>(DEFAULTS);
  const [outlet, setOutlet] = useState<string | null>(null);
  const [brand, setBrand] = useState('Fresh');
  const [done, setDone] = useState<{ refs: string[]; date: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null); // set on the client only, so server and browser render the same HTML
  useEffect(() => { api<Cat>('/api/store/orders').then(setCat); const o = localStorage.getItem('wp-store-outlet'); setOutlet(o); api<{ outlet: { brand: string; id: string } }>(`/api/store/overview${o ? `?outlet=${o}` : ''}`).then((x) => { setBrand(x.outlet.brand); setOutlet(x.outlet.id); if (x.outlet.brand !== 'Fresh') setTab('ambient'); }); setNow(new Date()); const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  // Cutoff countdown to 16:00 Sri Lanka time today.
  const left = useMemo(() => {
    if (!now) return '…';
    const sl = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));
    const m = 16 * 60 - (sl.getHours() * 60 + sl.getMinutes());
    return m > 0 ? `${Math.floor(m / 60)} h ${m % 60} min left` : 'closed for today — this goes on the next run';
  }, [now]);
  const items = Object.entries(cat ?? {}).filter(([, v]) => v.temp === tab);
  const units = items.reduce((a, [k]) => a + (qty[k] ?? 0), 0);
  const m3 = items.reduce((a, [k, v]) => a + (qty[k] ?? 0) * v.m3, 0);

  async function send() {
    setErr(null);
    try { const r = await api<{ created: { ref: string }[]; deliveryDate: string }>('/api/store/orders', { json: { outletId: outlet, lines: items.map(([sku]) => ({ sku, qty: qty[sku] ?? 0 })) } }); setDone({ refs: r.created.map((c) => c.ref), date: r.deliveryDate }); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="phone">
      <header className="appbar">
        <Link href="/store" aria-label="Back" style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'inherit', marginLeft: -10 }}><Icon name="back" size={20} /></Link>
        <div className="col" style={{ gap: 0 }}><span className="lbl">Waypoint {brand} · <span className="mono">{outlet}</span></span><span className="h" style={{ fontSize: 18, fontWeight: 700 }}>Place order</span></div>
        <span className="muted right" style={{ fontSize: 13, fontWeight: 600 }}>EN · தமிழ்</span>
      </header>
      <main className="pbody">
        <div className="banner" style={{ background: 'var(--ink)', color: '#fff' }}><Icon name="clock" size={24} style={{ color: 'var(--brand)' }} /><div style={{ fontSize: 14 }}><b>Orders close at 16:00 · {left}</b><div style={{ color: '#D9D7D0', fontSize: 13 }}>Orders after 16:00 go on the following run</div></div></div>
        {done ? (
          <div className="blk" style={{ borderColor: 'var(--ok)' }}>
            <span className="tag t-ok" style={{ alignSelf: 'flex-start' }}><Icon name="check" size={13} />Order confirmed</span>
            <span className="h" style={{ fontSize: 20, fontWeight: 800 }}>Reference {done.refs.join(', ')}</span>
            <span style={{ fontSize: 14 }}>For delivery on {prettyDate(done.date, { weekday: 'long', day: 'numeric', month: 'long' })}. The dispatcher sees it in the order queue now.</span>
            <Link className="btn btn-p" href="/store">Back to deliveries</Link>
          </div>
        ) : <>
          {brand === 'Fresh' && <div className="row" style={{ padding: 4, background: '#E6E4DE', borderRadius: 10, gap: 4 }}>{(['chilled', 'ambient'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className="grow" style={{ height: 44, border: 0, borderRadius: 8, fontWeight: 600, background: tab === t ? '#fff' : 'transparent', cursor: 'pointer' }}>{t === 'chilled' ? 'Chilled' : 'Dry goods'}</button>)}</div>}
          <div className="blk" style={{ gap: 0, padding: '2px 14px' }}>
            {items.map(([k, v]) => (
              <div key={k} className="row" style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div className="grow"><b>{v.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{v.pack} · last week {DEFAULTS[k]}</div></div>
                <div className="stepper"><button onClick={() => setQty({ ...qty, [k]: Math.max(0, (qty[k] ?? 0) - 1) })} aria-label={`Fewer ${v.name}`}>−</button><span>{qty[k] ?? 0}</span><button onClick={() => setQty({ ...qty, [k]: (qty[k] ?? 0) + 1 })} aria-label={`More ${v.name}`}>+</button></div>
              </div>
            ))}
          </div>
          <div className="row" style={{ fontSize: 14 }}><span>{units} units · about {m3.toFixed(2)} m³</span>{tab === 'chilled' && <span className="tag t-chill right">Needs a refrigerated vehicle</span>}</div>
          {err && <div className="tag t-bad" role="alert">{err}</div>}
        </>}
      </main>
      {!done && <footer className="pfoot"><button className="btn btn-p btn-lg" disabled={!units} onClick={send}>Send {tab === 'chilled' ? 'chilled' : 'dry goods'} order</button><span className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>You get a reference number straight away</span></footer>}
    </div>
  );
}
