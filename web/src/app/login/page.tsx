'use client';
import { useState } from 'react';
import { Logo } from '@/components/Logo';

const ACCOUNTS = [
  { email: 'dispatcher@waypoint.lk', role: 'Dispatcher', who: 'Dilani · Peliyagoda planning office', device: 'Desktop' },
  { email: 'loader@waypoint.lk', role: 'Loader', who: 'Ruwan · Kandy Dock 3', device: 'Phone / tablet' },
  { email: 'driver@waypoint.lk', role: 'Driver', who: 'Nuwan · Kandy hill routes', device: 'Phone' },
  { email: 'store@waypoint.lk', role: 'Store manager', who: 'Fathima · OUT106 Nuwara Eliya', device: 'Phone / PC' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(e?: React.FormEvent, preset?: string) {
    e?.preventDefault();
    setBusy(true); setError('');
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: preset ?? email, password: preset ? 'Waypoint@2026' : password }) });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setBusy(false); return; }
    window.location.href = data.home;
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 920, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        <section className="col" style={{ gap: 16, justifyContent: 'center' }}>
          <div className="row" style={{ gap: 12 }}><Logo size={40} dark /><span className="h" style={{ fontSize: 22, fontWeight: 700 }}>Waypoint Dispatch</span></div>
          <h1 style={{ fontSize: 36, lineHeight: 1.05, fontWeight: 800 }}>One delivery plan. Four roles. Still works when things break.</h1>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>Demo day: <b>Friday 10 April 2026</b>, three days before New Year. Peliyagoda has 5 of 9 refrigerated vehicles in the workshop; the Kandy hill routes lose signal.</p>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Apex Intelligent · Tech-Triathlon 2026 Hackathon</p>
        </section>
        <section className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="lbl">Sign in as a role (demo accounts)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            {ACCOUNTS.map((a) => (
              <button key={a.email} className="card" disabled={busy} onClick={() => signIn(undefined, a.email)} style={{ textAlign: 'left', padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 96 }}>
                <span className="lbl">{a.device}</span>
                <span className="h" style={{ fontSize: 17, fontWeight: 700 }}>{a.role}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>{a.who}</span>
              </button>
            ))}
          </div>
          <form onSubmit={signIn} className="col" style={{ gap: 10, borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
            <label className="col" style={{ gap: 4 }}><span className="lbl">Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
            <label className="col" style={{ gap: 4 }}><span className="lbl">Password</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
            {error && <div className="tag t-bad" role="alert">{error}</div>}
            <button className="btn btn-p" disabled={busy}>Sign in</button>
            <div className="muted" style={{ fontSize: 12 }}>Password for all demo accounts: <span className="mono">Waypoint@2026</span></div>
          </form>
        </section>
      </div>
    </main>
  );
}
