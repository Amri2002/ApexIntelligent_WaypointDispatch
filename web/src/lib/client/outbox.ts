'use client';
// Offline-first outbox for loaders and drivers. Every action is saved on the device first
// (IndexedDB), then sent to /api/sync when there is signal. The server applies each event
// exactly once, so retries are safe.
import { get, set } from 'idb-keyval';
import { useCallback, useEffect, useState } from 'react';

export interface OutEvent { id: string; kind: string; at: string; payload: Record<string, unknown> }
export interface SyncResult { id: string; status: 'applied' | 'duplicate' | 'rejected'; message?: string; matched?: string }
export interface SyncReport { at: string; events: (OutEvent & { result?: SyncResult })[] }

const QUEUE = 'wp-outbox';
const REPORT = 'wp-last-sync';
const SIM = 'wp-sim-offline';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function simulatedOffline() { try { return localStorage.getItem(SIM) === '1'; } catch { return false; } }
export function setSimulatedOffline(v: boolean) { try { localStorage.setItem(SIM, v ? '1' : '0'); } catch { /* ignore */ } notify(); if (!v) void flush(); }
export function isOnline() { return typeof navigator !== 'undefined' && navigator.onLine && !simulatedOffline(); }

export async function queue(): Promise<OutEvent[]> { return ((await get(QUEUE)) as OutEvent[] | undefined) ?? []; }

export async function enqueue(kind: string, payload: Record<string, unknown>) {
  const ev: OutEvent = { id: uid(), kind, at: new Date().toISOString(), payload: { ...payload, offline: !isOnline() } };
  await set(QUEUE, [...(await queue()), ev]);
  notify();
  void flush();
  return ev;
}

let flushing: Promise<SyncReport | null> | null = null;
export function flush(): Promise<SyncReport | null> {
  if (flushing) return flushing;
  if (!isOnline()) return Promise.resolve(null);
  flushing = (async () => {
    // Yield first so `flushing` is assigned before the finally block can clear it.
    await Promise.resolve();
    try {
      if (!isOnline()) return null;
      const events = await queue();
      if (!events.length) return null;
      const res = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) });
      if (!res.ok) return null;
      const { results } = (await res.json()) as { results: SyncResult[] };
      const done = new Set(results.map((r) => r.id));
      await set(QUEUE, (await queue()).filter((e) => !done.has(e.id)));
      const report: SyncReport = { at: new Date().toISOString(), events: events.map((e) => ({ ...e, result: results.find((r) => r.id === e.id) })) };
      // Keep a report only when something was recorded offline, so the driver sees what was sent.
      if (events.some((e) => e.payload.offline)) await set(REPORT, report);
      return report;
    } catch { return null; } finally { flushing = null; notify(); }
  })();
  return flushing;
}

export async function lastReport() { return (await get(REPORT)) as SyncReport | undefined; }
export async function clearReport() { await set(REPORT, undefined); notify(); }

/** Caches a server response on the device so the screen still opens without signal. */
export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<{ data: T | null; fromCache: boolean }> {
  if (isOnline()) {
    try { const data = await fetcher(); await set(`wp-cache:${key}`, data); return { data, fromCache: false }; } catch { /* fall through to cache */ }
  }
  return { data: ((await get(`wp-cache:${key}`)) as T | undefined) ?? null, fromCache: true };
}

export function useOutbox() {
  const [pending, setPending] = useState<OutEvent[]>([]);
  const [online, setOnline] = useState(true);
  const [report, setReport] = useState<SyncReport | undefined>();
  const [simulated, setSim] = useState(false);
  const refresh = useCallback(async () => { setSim(simulatedOffline()); setOnline(isOnline()); setPending(await queue()); setReport(await lastReport()); }, []);
  useEffect(() => {
    void refresh();
    listeners.add(refresh);
    const on = () => { void refresh(); void flush(); };
    window.addEventListener('online', on); window.addEventListener('offline', on);
    const t = setInterval(() => { void flush(); }, 15000);
    return () => { listeners.delete(refresh); window.removeEventListener('online', on); window.removeEventListener('offline', on); clearInterval(t); };
  }, [refresh]);
  const setSimulated = useCallback((v: boolean) => { setSim(v); setOnline(!v && navigator.onLine); setSimulatedOffline(v); }, []);
  return { pending, online, report, simulated, setSimulated, flush, clearReport };
}
