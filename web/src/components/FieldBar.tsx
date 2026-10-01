'use client';
// App bar for the phone screens (loader, driver): shows sync state and lets a judge simulate losing signal.
import Link from 'next/link';
import { useState } from 'react';
import { Icon } from './Icon';
import { useOutbox } from '@/lib/client/outbox';
import { logout } from '@/lib/client/api';

export function FieldBar({ kicker, title, back, offlineTitle }: { kicker: string; title: React.ReactNode; back?: string; offlineTitle?: boolean }) {
  const { pending, online, simulated, setSimulated } = useOutbox();
  const [menu, setMenu] = useState(false);
  const dark = !online && offlineTitle;
  return (
    <>
      <header className={`appbar ${dark ? 'offline' : ''}`}>
        {back && <Link href={back} aria-label="Back" style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'inherit', marginLeft: -10 }}><Icon name="back" size={20} /></Link>}
        <div className="col" style={{ gap: 0, minWidth: 0 }}><span className="lbl">{kicker}</span><span className="h" style={{ fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span></div>
        <button className="right" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Connection and account" style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }}>
          {online
            ? <span className="tag t-ok"><Icon name={pending.length ? 'sync' : 'check'} size={13} />{pending.length ? `Sending ${pending.length}` : 'Online'}</span>
            : <span className="tag" style={{ background: dark ? '#fff' : 'var(--off-bg)', color: 'var(--off)' }}><Icon name="wifiOff" size={13} />No signal{pending.length ? ` · ${pending.length} saved` : ''}</span>}
        </button>
      </header>
      {menu && (
        <div className="card col" style={{ position: 'sticky', top: 60, zIndex: 6, margin: '0 12px', padding: 14, gap: 10, boxShadow: '0 10px 30px rgba(0,0,0,.12)' }}>
          <label className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
            <span><b>Simulate no signal</b><br /><span className="muted" style={{ fontSize: 12.5 }}>For the demo: work as if coverage dropped. Turning it off sends everything.</span></span>
            <input type="checkbox" checked={simulated} onChange={(e) => setSimulated(e.target.checked)} style={{ width: 22, height: 22 }} />
          </label>
          <div className="muted" style={{ fontSize: 12.5 }}>{pending.length ? `${pending.length} record${pending.length > 1 ? 's' : ''} saved on this phone, waiting to send.` : 'Nothing waiting to send.'}</div>
          <button className="btn btn-s" onClick={logout}><Icon name="logout" size={16} />Sign out</button>
        </div>
      )}
    </>
  );
}
