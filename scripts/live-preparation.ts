import { readFileSync, writeFileSync } from 'node:fs';
import { api, waitForRun } from './smoke.js';
import type { Run } from '../src/shared/types.js';

// Read-only model/browser work followed by an approval barrier. This script NEVER approves or submits an action.
const prepared = JSON.parse(readFileSync('.data/validation/prepared-email.json', 'utf8')) as { testId: string; recipient: string; subject: string; body: string; action: { target: string; operation: string; message: string; maxSpendCents: number } };
const existing = await api<Run[]>('/api/runs');
if (existing.some(run => !['completed', 'partial', 'failed', 'cancelled', 'interrupted'].includes(run.status))) throw new Error('An existing run needs attention. Do not replace it automatically.');
const run = await api<Run>('/api/runs', {
  mode: 'live', strategy: 'parallel', urls: ['https://example.com/'], prepareAction: true, maxWorkers: 1,
  goal: `Development integration test ${prepared.testId}. Use exactly one primary browser worker to read https://example.com/ and identify the domain's stated purpose. Do not add duplicate/speculative workers. Prepare, but do not send, one zero-spend test email to my own address ${prepared.recipient}. Subject: ${prepared.subject}. Exact body:\n${prepared.body}\nNo attachments, calls, purchases, bookings or follow-ups. This is only a draft for later exact human approval.`,
});
const awaiting = await waitForRun(run.id, r => r.status === 'awaiting_approval', 150_000);
if (!awaiting.action || awaiting.fo.status !== 'idle' || awaiting.workers.filter(worker => worker.status === 'ready').length < 1) throw new Error('Live preparation did not reach a safe evidence-backed approval barrier.');
const exact = await api<Run>(`/api/runs/${run.id}/action`, prepared.action);
if (exact.action?.target !== prepared.recipient || exact.action.message !== prepared.action.message || exact.action.maxSpendCents !== 0 || exact.action.status !== 'pending') throw new Error('The exact approved-to-review test payload was not stored.');
writeFileSync('.data/validation/live-preparation.json', JSON.stringify({ runId: run.id, testId: prepared.testId, actionId: exact.action.id, fingerprint: exact.action.fingerprint,
  phase: 'pending human approval; no Fo action submitted', modelUsage: exact.usage, evidence: exact.workers.map(worker => ({ id: worker.id, status: worker.status, captured: worker.evidence.length, screenshot: !!worker.screenshot })) }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ runId: run.id, phase: 'awaiting_approval', liveFoSubmitted: false, requests: exact.usage.reduce((sum, usage) => sum + usage.requests, 0), models: exact.usage.map(usage => usage.model), evidenceSources: exact.workers.filter(worker => worker.status === 'ready').length }, null, 2));
