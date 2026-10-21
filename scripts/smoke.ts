import { writeFileSync, mkdirSync } from 'node:fs';
import type { Run } from '../src/shared/types.js';

const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:4318';
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${origin}${path}`, { ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}
export async function waitForRun(id: string, predicate: (run: Run) => boolean, timeoutMs = 150_000): Promise<Run> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await api<Run>(`/api/runs/${id}`);
    if (predicate(run)) return run;
    if (['failed', 'cancelled', 'partial', 'interrupted'].includes(run.status)) throw new Error(`Run ${run.status}: ${run.error ?? run.summary}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Run deadline exceeded.');
}
export async function sandboxRun(strategy: 'sequential' | 'parallel', goal = 'Compare dinner options for eight people and prepare an inquiry with a backup.'): Promise<Run> {
  const run = await api<Run>('/api/runs', { goal, mode: 'sandbox', strategy, scenario: 'comparison', prepareAction: true });
  const prepared = await waitForRun(run.id, r => r.status === 'awaiting_approval');
  if (!prepared.action || prepared.workers.filter(w => w.status === 'ready').length !== 2) throw new Error('Primary evidence or approval barrier missing.');
  const rejected = await fetch(`${origin}/api/runs/${run.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerprint: '0'.repeat(64) }) });
  if (rejected.status !== 403) throw new Error('Tampered fingerprint was not rejected.');
  await api(`/api/runs/${run.id}/approve`, { fingerprint: prepared.action.fingerprint });
  const completed = await waitForRun(run.id, r => r.status === 'completed');
  if (!completed.fo.simulated || completed.fo.status !== 'complete' || completed.workers.some(w => !w.screenshot || !w.evidence.length)) throw new Error('Sandbox did not complete the browser/service path.');
  if (completed.usage.length) throw new Error('Sandbox unexpectedly used paid inference.');
  return completed;
}
if (process.argv[1]?.endsWith('smoke.ts')) {
  const health = await api<{ ok: boolean; liveActions: boolean }>('/api/health');
  if (!health.ok || health.liveActions) throw new Error('Smoke requires a healthy app with live actions disabled.');
  const run = await sandboxRun('parallel');
  mkdirSync('.data/validation', { recursive: true });
  writeFileSync('.data/validation/smoke.json', JSON.stringify({ passed: true, runId: run.id, mode: run.mode, service: 'simulated', metrics: run.metrics, paidRequests: run.usage.length }, null, 2));
  console.log(JSON.stringify({ passed: true, runId: run.id, workers: run.workers.length, metrics: run.metrics, paidRequests: 0 }));
}
