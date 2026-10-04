'use client';
// Pick a vehicle for an order. The server dry-runs every vehicle through the same checks as a
// real move, so legal ones are listed first and the others show the rule that blocks them.
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

interface Option { vehicleId: string; temp: string; type: string; volumeCapM3: number; trips: number; joinsTrip: boolean; ok: boolean; reason: string | null }

export function MoveDialog({ planId, order, verb, busy, onPick, onClose }: {
  planId: string; order: { orderId: string; ref: string }; verb: string; busy: boolean;
  onPick: (vehicleId: string) => void; onClose: () => void;
}) {
  const [opts, setOpts] = useState<Option[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);
  useEffect(() => {
    let live = true;
    api<{ options: Option[] }>(`/api/plans/${planId}/options?orderId=${order.orderId}`)
      .then((r) => { if (live) setOpts(r.options); })
      .catch((e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [planId, order.orderId]);
  const ok = opts?.filter((o) => o.ok) ?? [];
  const blocked = opts?.filter((o) => !o.ok) ?? [];

  return (
    <div role="dialog" aria-label={`${verb} order`} style={{ position: 'fixed', inset: 0, background: 'rgba(22,24,29,.45)', display: 'grid', placeItems: 'center', zIndex: 40 }} onClick={onClose}>
      <div className="card col" style={{ padding: 20, width: 460, maxWidth: '92vw' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 18 }}>{verb} {order.ref} on…</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Every vehicle was checked against all nine rules. Only the ones that pass can be chosen.</p>
        {err && <div className="tag t-bad" role="alert">{err}</div>}
        {!opts && !err && <div className="muted">Checking vehicles…</div>}
        <div className="col scroll" style={{ maxHeight: 380, gap: 6 }}>
          {opts && !ok.length && <div className="blk" style={{ fontSize: 13 }}>No vehicle can take this order without breaking a rule. To make room, defer another order from a vehicle first, then try again.</div>}
          {ok.map((v) => (
            <button key={v.vehicleId} className="btn btn-s" style={{ justifyContent: 'space-between', flexWrap: 'wrap', height: 'auto', minHeight: 44, padding: '8px 12px', gap: 6, textAlign: 'left' }} disabled={busy} onClick={() => onPick(v.vehicleId)}>
              <span className="mono">{v.vehicleId}</span>
              <span className="muted" style={{ fontWeight: 500 }}>{v.temp} {v.type} · {v.volumeCapM3} m³ · {v.joinsTrip ? 'joins a trip to this district' : v.trips ? `new trip (has ${v.trips})` : 'idle today'}</span>
            </button>
          ))}
          {blocked.length > 0 && <button className="btn btn-sm btn-s" style={{ alignSelf: 'flex-start' }} onClick={() => setShowBlocked(!showBlocked)}>{showBlocked ? 'Hide' : 'Show'} {blocked.length} vehicles that cannot take it</button>}
          {showBlocked && blocked.map((v) => (
            <div key={v.vehicleId} className="row" style={{ fontSize: 12.5, padding: '4px 2px', borderBottom: '1px solid var(--line-soft)', alignItems: 'flex-start' }}>
              <span className="mono" style={{ minWidth: 60 }}>{v.vehicleId}</span><span className="muted">{v.reason}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-s" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
