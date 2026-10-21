import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { Plan, Run, RunRequest, WorkItem } from '../src/shared/types.js';

vi.mock('../src/planner/index.js', () => ({
  createPlan: vi.fn(async (_request: RunRequest): Promise<Plan> => ({
    summary: 'Two primary sources and one independently owned backup.',
    workItems: [
      { id: 'primary-a', title: 'Primary A', url: 'http://127.0.0.1:4318/fixtures/a', objective: 'Read option A.', dependsOn: [] },
      { id: 'primary-b', title: 'Primary B', url: 'http://127.0.0.1:4318/fixtures/b', objective: 'Read option B.', dependsOn: [] },
      { id: 'backup-c', title: 'Backup C', url: 'http://127.0.0.1:4318/fixtures/c', objective: 'Prepare backup evidence.', dependsOn: [], speculative: true },
    ],
    proposedAction: { target: 'self@example.test', operation: 'inquiry', message: 'Ask about the available fixture option; do not book or pay.', maxSpendCents: 0 },
    uncertainties: ['Fixture data only.'],
  })),
}));
vi.mock('../src/browser/index.js', () => ({
  research: vi.fn(async (item: WorkItem, options: { signal: AbortSignal }) => {
    options.signal.throwIfAborted();
    await new Promise(resolve => setTimeout(resolve, 10));
    return { evidence: [{ id: `evidence-${item.id}`, workerId: item.id, title: item.title, url: item.url,
      text: 'Observed fixture availability.', capturedAt: new Date().toISOString(), source: 'fixture', verified: false }], usage: [] };
  }),
}));

import { RunEngine } from '../src/server/engine.js';
import { AuthorizationError } from '../src/security/action-ledger.js';
import { createPlan } from '../src/planner/index.js';
import { research } from '../src/browser/index.js';
import { createApp } from '../src/server/app.js';
import { redactForExport } from '../src/server/store.js';

const engines: RunEngine[] = [];
const directories: string[] = [];
let retainedDirectories = 0;
afterAll(() => { console.info(`Engine test artifacts retained after Windows file-lock errors: ${retainedDirectories} ignored temporary database directories.`); });
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  for (const engine of engines.splice(0).reverse()) await engine.close();
  for (const directory of directories.splice(0)) {
    const scope = relative(resolve(process.cwd(), '.data'), resolve(directory));
    if (!scope.startsWith('test-engine-') || scope.includes('..') || isAbsolute(scope)) throw new Error('Refusing cleanup outside the engine test directory.');
    try { rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
    catch (error) {
      // Windows libSQL may retain a native mmap/statement handle until the worker exits.
      // Keep that ignored fixture database rather than masking workflow assertions with
      // an artifact-deletion failure. Engine.close() errors above still fail the test.
      if (!['EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      retainedDirectories++;
    }
  }
}, 60_000);
function dataDirectory(): string {
  mkdirSync(join(process.cwd(), '.data'), { recursive: true });
  const path = mkdtempSync(join(process.cwd(), '.data', 'test-engine-')); directories.push(path); return path;
}
function engine(dataDir = dataDirectory()): RunEngine {
  const instance = new RunEngine({ dataDir, origin: 'http://127.0.0.1:4318', maxWorkers: 2, liveFoEnabled: false });
  engines.push(instance); return instance;
}
async function until(run: Run, predicate: (run: Run) => boolean, timeout = 45_000): Promise<void> {
  await vi.waitFor(() => {
    if (run.status === 'failed') throw new Error(`Engine run failed: ${run.error ?? 'No error detail.'}`);
    expect(predicate(run), `Run state: ${run.status}; Fo state: ${run.fo.status}`).toBe(true);
  }, { timeout, interval: 25 });
}
const request = (goal = 'Compare fixture options and prepare my inquiry.'): RunRequest => ({ goal, mode: 'sandbox', strategy: 'parallel', prepareAction: true });

function completedProviderReceipt(runtime: RunEngine): Run {
  const id = '00000000-0000-4000-8000-000000000001';
  const pending = runtime.ledger.propose({ runId: id, target: 'self@example.test', operation: 'email', message: 'Exact approved plain-text body.', maxSpendCents: 0 });
  runtime.ledger.approve(pending.id, id, pending.fingerprint);
  const claim = runtime.ledger.claim(pending.id, id, pending.fingerprint);
  const action = runtime.ledger.recordReply(claim, { status: 'complete', conversationId: 'synthetic-provider-receipt', response: 'Provider reports that the message was sent.' });
  const at = new Date().toISOString();
  const run: Run = { id, goal: 'Inspect a synthetic provider-reported email outcome without resubmitting.', mode: 'live', strategy: 'parallel', status: 'partial',
    createdAt: at, updatedAt: at, finishedAt: at, action,
    workers: [{ id: 'primary-a', title: 'Source A', url: 'http://127.0.0.1:4318/fixtures/a', objective: 'Capture source.', status: 'ready', speculative: false,
      evidence: [{ id: 'evidence-a', workerId: 'primary-a', title: 'Source observation', url: 'http://127.0.0.1:4318/fixtures/a', text: 'Source data only.', capturedAt: at, source: 'browser', verified: false }] }],
    events: [], fo: { status: 'complete', simulated: false, conversationId: 'synthetic-provider-receipt', response: 'Provider reports that the message was sent.' },
    usage: [], uncertainties: [], summary: 'Fo reported completion; independent outcome verification is pending.',
    metrics: { elapsedMs: 0, browserActiveMs: 0, foWaitMs: 0, overlapMs: 0, maxConcurrentWorkers: 1 } };
  runtime.store.save(run); return run;
}

describe('real Mastra workflow, local storage and exact-action approval', () => {
  it('keeps delivery with an added footer and HTML partial without resubmitting or rewriting the completed ledger', async () => {
    const runtime = engine(); const run = completedProviderReceipt(runtime);
    const submit = vi.spyOn(runtime.liveFo, 'submitApproved');
    const answer = vi.spyOn(runtime.liveFo, 'answerApproved');
    const priorAction = runtime.ledger.get(run.action!.id);
    const checks = { deliveryObserved: true, recipientMatches: true, subjectMatches: true, bodyMatches: false, noAttachments: true, plainTextOnly: false };
    const app = createApp(runtime);
    const endpoint = `http://127.0.0.1:4318/api/runs/${run.id}/verify`;
    const input = { confirmed: true as const, observed: true, method: 'operator_gmail_receipt' as const,
      note: 'Synthetic Gmail receipt includes an unapproved footer and an HTML alternative.', reference: 'synthetic-gmail-receipt', checks };
    const post = (value: unknown) => app.request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: runtime.options.origin }, body: JSON.stringify(value) });
    const response = await post(input);
    expect(response.status).toBe(200);
    expect(run.verification?.status).toBe('partial'); expect(run.status).toBe('partial');
    expect(run.verification?.checks).toEqual(checks);
    expect(run.summary).toContain('partially'); expect(run.summary).not.toContain('pending');
    expect(run.fo.status).toBe('complete'); expect(run.fo.response).toBe('Provider reports that the message was sent.');
    expect(runtime.ledger.get(run.action!.id)).toEqual(priorAction);
    expect(() => runtime.ledger.claim(run.action!.id, run.id, run.action!.fingerprint)).toThrow();
    expect(run.workers[0]!.evidence[0]!.verified).toBe(false);
    expect(submit).not.toHaveBeenCalled(); expect(answer).not.toHaveBeenCalled();
    const exported = redactForExport(run);
    expect(exported.verification?.checks).toEqual(checks); expect(exported.verification?.method).toBe('operator_gmail_receipt');
    expect(exported.verification?.note).toBe('[redacted private text]'); expect(exported.verification?.reference).toBe('[redacted private text]');
    expect((await post({ ...input, checks: { ...checks, unexpected: true } })).status).toBe(400);
    expect((await post({ ...input, checks: { ...checks, bodyMatches: 'false' } })).status).toBe(400);
    expect((await post({ ...input, checks: { ...checks, plainTextOnly: undefined } })).status).toBe(400);
    expect((await post({ ...input, checks: undefined })).status).toBe(403);
    expect((await post({ ...input, method: 'human_receipt' })).status).toBe(403);
    expect(run.verification?.status).toBe('partial');
  }, 60_000);

  it('requires verified checks and healthy workers before a live run becomes completed', () => {
    const runtime = engine(); const run = completedProviderReceipt(runtime);
    const checks = { deliveryObserved: true, recipientMatches: true, subjectMatches: true, bodyMatches: true, noAttachments: true, plainTextOnly: true };
    run.workers[0]!.status = 'cancelled';
    runtime.recordVerification(run.id, { observed: true, method: 'operator_gmail_receipt', checks, note: 'Every receipt check passed.', reference: 'synthetic-gmail-receipt' });
    expect(run.verification?.status).toBe('verified'); expect(run.status).toBe('partial');
    run.workers[0]!.status = 'ready';
    runtime.recordVerification(run.id, { observed: true, method: 'operator_gmail_receipt', checks, note: 'Every receipt check passed.', reference: 'synthetic-gmail-receipt' });
    expect(run.status).toBe('completed'); expect(run.summary).toContain('verified');
    runtime.recordVerification(run.id, { observed: false, method: 'operator_gmail_receipt', checks: { ...checks, deliveryObserved: false }, note: 'Delivery could not be confirmed.', reference: 'synthetic-gmail-receipt' });
    expect(run.verification?.status).toBe('uncertain'); expect(run.status).toBe('partial'); expect(run.summary).toContain('uncertain');
  }, 60_000);

  it('suspends after primary evidence, rejects forged approval and records a human rejection', async () => {
    const runtime = engine(); const run = runtime.start(request());
    await until(run, value => value.status === 'awaiting_approval');
    expect(run.workers.filter(worker => worker.status === 'ready')).toHaveLength(2);
    expect(run.workers.find(worker => worker.id === 'backup-c')?.status).toBe('queued');
    expect(run.fo.status).toBe('idle');
    expect(() => runtime.recordVerification(run.id, { observed: true, note: 'Premature receipt.', reference: 'fixture://receipt' })).toThrow(AuthorizationError);
    expect(run.action?.status).toBe('pending');
    await expect(runtime.approve(run.id, '0'.repeat(64))).rejects.toThrow(/match/);
    expect(runtime.ledger.get(run.action!.id).status).toBe('pending');
    const original = run.action!;
    runtime.replaceAction(run.id, { target: 'revised-self@example.test', operation: 'email', message: 'The revised exact inquiry; do not book or pay.', maxSpendCents: 0 });
    expect(run.action!.id).not.toBe(original.id);
    expect(run.action!.fingerprint).not.toBe(original.fingerprint);
    expect(runtime.ledger.get(original.id).status).toBe('rejected');
    await expect(runtime.approve(run.id, original.fingerprint)).rejects.toThrow(/match/);
    expect(runtime.ledger.get(run.action!.id).status).toBe('pending');
    runtime.reject(run.id);
    expect(run.status).toBe('cancelled'); expect(run.action?.status).toBe('rejected');
    expect(vi.mocked(research)).toHaveBeenCalledTimes(2);
  }, 60_000);

  it('honors a one-worker request within the real parallel Mastra workflow', async () => {
    const runtime = engine();
    const run = runtime.start({ ...request(), maxWorkers: 1 });
    await until(run, value => value.status === 'awaiting_approval');
    expect(run.strategy).toBe('parallel'); expect(run.workerLimit).toBe(1);
    expect(run.workers.filter(worker => worker.status === 'ready')).toHaveLength(2);
    expect(run.metrics.maxConcurrentWorkers).toBe(1);
    expect(vi.mocked(research)).toHaveBeenCalledTimes(2);
    runtime.reject(run.id);
  }, 60_000);

  it('resumes an approved sandbox action, runs its backup and completes with simulated evidence', async () => {
    const runtime = engine(); const run = runtime.start(request());
    await until(run, value => value.status === 'awaiting_approval');
    await runtime.approve(run.id, run.action!.fingerprint);
    await until(run, value => value.status === 'completed');
    expect(run.workers.every(worker => worker.status === 'ready')).toBe(true);
    expect(run.fo.simulated).toBe(true); expect(run.fo.status).toBe('complete');
    expect(runtime.ledger.get(run.action!.id).status).toBe('complete');
    expect(run.workers.flatMap(worker => worker.evidence).every(evidence => !evidence.verified)).toBe(true);
    expect(run.summary).toContain('no external action');
    runtime.recordVerification(run.id, { observed: true, note: 'Inspected the simulated receipt; no external completion claimed.', reference: 'fixture://simulated-receipt' });
    expect(run.verification?.method).toBe('human_receipt'); expect(run.verification?.status).toBe('verified');
    expect(run.workers.flatMap(worker => worker.evidence).every(evidence => !evidence.verified)).toBe(true);
    expect(vi.mocked(research)).toHaveBeenCalledTimes(3);
  }, 60_000);

  it('does not prepare an external action when primary workers return no evidence', async () => {
    vi.mocked(research).mockResolvedValueOnce({ evidence: [], usage: [] }).mockResolvedValueOnce({ evidence: [], usage: [] });
    const runtime = engine(); const run = runtime.start(request());
    await until(run, value => ['completed', 'partial'].includes(value.status));
    expect(run.action).toBeUndefined(); expect(run.plan?.proposedAction).toBeUndefined();
    expect(run.fo.status).toBe('idle'); expect(runtime.ledger.listForRun(run.id)).toHaveLength(0);
    expect(run.events.some(event => event.type === 'research_failed')).toBe(true);
  }, 60_000);

  it('requires a new exact approval for the answer to a provider question', async () => {
    const runtime = engine(); const run = runtime.start(request('Compare fixture options; exercise the simulated question flow.'));
    await until(run, value => value.status === 'awaiting_approval');
    const original = run.action!;
    await runtime.approve(run.id, original.fingerprint);
    await until(run, value => value.status === 'awaiting_input');
    runtime.prepareAnswer(run.id, 'Proceed with the inquiry only; do not book or pay.');
    expect(run.status).toBe('awaiting_approval');
    expect(run.action!.id).not.toBe(original.id);
    expect(run.action!.target).toBe(`conversation:${run.fo.conversationId}`);
    expect(runtime.ledger.get(run.action!.id).status).toBe('pending');
    await expect(runtime.approve(run.id, original.fingerprint)).rejects.toThrow(/match/);
    await runtime.approve(run.id, run.action!.fingerprint);
    await until(run, value => value.status === 'completed');
    expect(runtime.ledger.listForRun(run.id)).toHaveLength(2);
    expect(runtime.ledger.listForRun(run.id).every(action => action.status === 'complete')).toBe(true);
  }, 60_000);

  it('reopens a persisted approval suspension and resumes without repeating planning or primary research', async () => {
    const directory = dataDirectory(); const first = engine(directory); const run = first.start(request());
    await until(run, value => value.status === 'awaiting_approval');
    // close() awaits the real Mastra start promise, including the storage write for suspension.
    await first.close();
    engines.splice(engines.indexOf(first), 1);
    vi.clearAllMocks();
    const restarted = engine(directory); const restored = restarted.required(run.id);
    expect(restored.status).toBe('awaiting_approval'); expect(restored.action?.fingerprint).toBe(run.action?.fingerprint);
    await restarted.approve(restored.id, restored.action!.fingerprint);
    await until(restored, value => value.status === 'completed');
    expect(vi.mocked(createPlan)).not.toHaveBeenCalled();
    expect(vi.mocked(research)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(research).mock.calls[0]![0].id).toBe('backup-c');
    expect(restored.fo.simulated).toBe(true); expect(restored.action?.status).toBe('complete');
  }, 60_000);
});
