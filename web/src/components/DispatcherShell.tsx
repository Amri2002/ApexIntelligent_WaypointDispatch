'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { api, logout } from '@/lib/client/api';

const NAV = [
  { href: '/dispatcher', label: 'Orders', icon: 'orders' },
  { href: '/dispatcher/plan', label: 'Plan', icon: 'truck' },
  { href: '/dispatcher/shortfall', label: 'Deferrals', icon: 'alert' },
  { href: '/dispatcher/live', label: 'Live run', icon: 'pin' },
  { href: '/dispatcher/forecast', label: 'Forecast', icon: 'chart' },
];

export type Depot = 'Peliyagoda' | 'Kandy';
export function useDepot(): [Depot, (d: Depot) => void] {
  const [depot, setDepotState] = useState<Depot>('Peliyagoda');
  useEffect(() => { const d = localStorage.getItem('wp-depot'); if (d === 'Kandy' || d === 'Peliyagoda') setDepotState(d); }, []);
  const setDepot = (d: Depot) => { localStorage.setItem('wp-depot', d); setDepotState(d); };
  return [depot, setDepot];
}

export function DepotSwitch({ depot, onChange }: { depot: Depot; onChange: (d: Depot) => void }) {
  return (
    <div className="seg" role="group" aria-label="Depot">
      {(['Peliyagoda', 'Kandy'] as Depot[]).map((d) => <button key={d} className={depot === d ? 'on' : ''} onClick={() => onChange(d)} aria-pressed={depot === d}>{d}</button>)}
    </div>
  );
}

export function DispatcherShell({ children, badge }: { children: React.ReactNode; badge?: Record<string, number> }) {
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  async function reset() {
    if (!confirm('Reset the demo day? All plans, deliveries and messages will be cleared.')) return;
    setBusy(true);
    await api('/api/admin/reset', { json: {} });
    localStorage.clear();
    window.location.href = '/dispatcher';
  }
  return (
    <div className="shell">
      <nav className="rail" aria-label="Dispatcher">
        <div className="row" style={{ gap: 10, padding: '4px 8px 18px' }}><Logo /><span className="h" style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Waypoint Dispatch</span></div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`nav ${path === n.href ? 'on' : ''}`}>
            <Icon name={n.icon} />{n.label}
            {badge?.[n.href] ? <span className="tag t-bad" style={{ marginLeft: 'auto' }}>{badge[n.href]}</span> : null}
          </Link>
        ))}
        <div className="who" style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid #2E313A', fontSize: 12.5, color: '#C9C6BE', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>Dilani Fernando<br /><span style={{ color: '#8F9199' }}>Dispatcher · Peliyagoda</span></span>
          <button className="btn btn-sm" style={{ background: '#262931', color: '#E9E7E1' }} onClick={reset} disabled={busy}>Reset demo day</button>
          <button className="btn btn-sm" style={{ background: 'transparent', color: '#C9C6BE', border: '1px solid #33363E' }} onClick={logout}><Icon name="logout" size={14} />Sign out</button>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}

export function Toast({ msg, bad, onDone }: { msg: string; bad?: boolean; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, bad ? 7000 : 3500); return () => clearTimeout(t); }, [onDone, bad]);
  return <div className={`toast ${bad ? 'bad' : ''}`} role="status">{msg}</div>;
}

export const brandTag = (b: string) => <span className={`tag ${b === 'Fresh' ? 't-fresh' : b === 'Style' ? 't-style' : 't-tech'}`}>{b}</span>;
export const tempTag = (t: string) => (t === 'chilled' ? <span className="tag t-chill"><Icon name="snow" size={12} />Chilled</span> : <span className="muted">Ambient</span>);
