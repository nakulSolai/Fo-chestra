import { useCallback, useEffect, useState } from 'react';
import type { Readiness, Run, RunRequest } from '../src/shared/types';

function newest(previous: Run | null, next: Run): Run {
  if (previous?.id !== next.id) return next;
  const previousEvent = previous.events.at(-1)?.id ?? 0;
  const nextEvent = next.events.at(-1)?.id ?? 0;
  return previousEvent > nextEvent || (previousEvent === nextEvent && previous.updatedAt > next.updatedAt) ? previous : next;
}

export async function request<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(path, data === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  if (!response.ok) throw new Error(body?.error || body?.message || `Request failed (${response.status}).`);
  return body as T;
}

export function useOrchestra() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [connected, setConnected] = useState(false);

  const refreshReadiness = useCallback(async () => {
    try { setReadiness(await request<Readiness>('/api/readiness')); }
    catch (e) { setError(e instanceof Error ? e.message : 'The local server is unavailable.'); }
  }, []);
  const refreshRuns = useCallback(async () => {
    try { setRuns(await request<Run[]>('/api/runs')); } catch { /* The readiness request surfaces server failures. */ }
  }, []);
  useEffect(() => {
    void refreshReadiness(); void refreshRuns();
    const timer = window.setInterval(() => { void refreshReadiness(); void refreshRuns(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [refreshReadiness, refreshRuns]);

  useEffect(() => {
    setConnected(false);
    if (!selectedId) { setRun(null); return; }
    let disposed = false;
    let live = false;
    let polling = false;
    const update = (next: Run) => {
      if (disposed) return;
      setRun(previous => newest(previous, next));
      setRuns(previous => [next, ...previous.filter(item => item.id !== next.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    };
    const poll = async () => {
      if (disposed || polling) return;
      polling = true;
      try { update(await request<Run>(`/api/runs/${encodeURIComponent(selectedId)}`)); }
      catch (e) { if (!disposed) setError(e instanceof Error ? e.message : 'Unable to load this run.'); }
      finally { polling = false; }
    };
    void poll();
    const stream = new EventSource(`/api/runs/${encodeURIComponent(selectedId)}/events`);
    stream.onopen = () => { live = true; if (!disposed) setConnected(true); };
    stream.onerror = () => { live = false; if (!disposed) setConnected(false); };
    stream.addEventListener('run', event => {
      try { update(JSON.parse((event as MessageEvent<string>).data) as Run); }
      catch { live = false; void poll(); }
    });
    const timer = window.setInterval(() => { if (!live) void poll(); }, 1000);
    return () => { disposed = true; stream.close(); window.clearInterval(timer); };
  }, [selectedId]);

  const create = async (body: RunRequest) => {
    setPending(true); setError('');
    try {
      const next = await request<Run>('/api/runs', body);
      setRun(next); setSelectedId(next.id); void refreshRuns();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start the run.'); }
    finally { setPending(false); }
  };
  const action = async (operation: string, body: unknown = {}) => {
    if (!selectedId) return;
    setPending(true); setError('');
    try {
      const next = await request<Run>(`/api/runs/${encodeURIComponent(selectedId)}/${operation}`, body);
      if (next?.id) setRun(previous => newest(previous, next));
      else setRun(await request<Run>(`/api/runs/${encodeURIComponent(selectedId)}`));
      void refreshRuns();
    } catch (e) { setError(e instanceof Error ? e.message : 'This action could not be completed.'); }
    finally { setPending(false); }
  };
  return { readiness, runs, run, selectedId, select: setSelectedId, error, clearError: () => setError(''), pending, connected, create, action, refreshReadiness };
}
