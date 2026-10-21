import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { LibSQLStore } from '@mastra/libsql';
import { z } from 'zod';
import { research } from '../browser/index.js';
import { createPlan } from '../planner/index.js';
import { FoMcpClient, approvedFoMessage, replyNeedsUserInput } from '../fo/client.js';
import { MockFoClient } from '../fo/mock-client.js';
import { ActionLedger, AuthorizationError } from '../security/action-ledger.js';
import type { EmailChecks, FoClient, FoReply, Run, RunEvent, RunRequest, Verification, WorkItem } from '../shared/types.js';
import { RunStore } from './store.js';
import { publicError } from './errors.js';
import { assessEvidence } from '../analysis/decision.js';
import { getVerificationStatus } from '../verification/email.js';

const contextSchema = z.object({ runId: z.string(), dispatch: z.boolean().default(false) });
const workSchema = z.object({ runId: z.string(), item: z.custom<WorkItem>() });
const initialSchema = z.object({ runId: z.string(), request: z.custom<RunRequest>() });
const errorText = publicError;
const terminal = new Set(['completed', 'partial', 'failed', 'cancelled', 'interrupted']);

export interface EngineOptions { dataDir: string; origin: string; maxWorkers: number; liveFoEnabled: boolean }

/** Mastra owns execution, fan-out and persisted approval suspension. The ledger owns write authority. */
export class RunEngine {
  readonly store: RunStore;
  readonly ledger: ActionLedger;
  readonly liveFo: FoMcpClient;
  private readonly storage: LibSQLStore;
  private readonly controllers = new Map<string, AbortController>();
  private readonly subscribers = new Map<string, Set<(run: Run) => void>>();
  private readonly mocks = new Map<string, MockFoClient>();
  private readonly jobs = new Map<string, Promise<unknown>>();
  private readonly workflow;
  private readonly sequentialWorkflow;
  private readonly batch;
  private readonly sequentialBatch;
  readonly mastra;
  anthropicVerified = false;

  constructor(readonly options: EngineOptions) {
    mkdirSync(options.dataDir, { recursive: true });
    this.store = new RunStore(join(options.dataDir, 'runs'));
    this.ledger = new ActionLedger(join(options.dataDir, 'actions.sqlite'), { budgetCents: Number(process.env.FO_SESSION_BUDGET_CENTS || 5000) });
    this.liveFo = new FoMcpClient({ ledger: this.ledger, enableLiveActions: options.liveFoEnabled, redirectUrl: `${options.origin}/api/fo/callback` });
    this.storage = new LibSQLStore({ id: 'fo-chestra-workflows', url: `file:${join(options.dataDir, 'workflows.db').replaceAll('\\', '/')}`, localPragmas: { mmapSize: 0 } });
    const worker = createStep({ id: 'browser-worker', inputSchema: workSchema, outputSchema: contextSchema,
      execute: async ({ inputData }) => { await this.work(inputData.runId, inputData.item); return { runId: inputData.runId, dispatch: false }; } });
    this.batch = createWorkflow({ id: 'browser-batch', inputSchema: z.array(workSchema), outputSchema: z.array(contextSchema) }).foreach(worker, { concurrency: options.maxWorkers }).commit();
    this.sequentialBatch = createWorkflow({ id: 'browser-batch-sequential', inputSchema: z.array(workSchema), outputSchema: z.array(contextSchema) }).foreach(worker, { concurrency: 1 }).commit();
    const plan = createStep({ id: 'plan', inputSchema: initialSchema, outputSchema: contextSchema,
      execute: async ({ inputData }) => {
        const run = this.required(inputData.runId);
        this.event(run, 'planning', 'Building a bounded research plan.');
        run.plan = await createPlan(inputData.request, { fixtureOrigin: options.origin, signal: this.signal(run.id), onUsage: usage => { run.usage.push(usage); this.anthropicVerified = true; this.save(run); } });
        run.uncertainties.push(...run.plan.uncertainties);
        run.workers = run.plan.workItems.map(item => ({ id: item.id, title: item.title, url: item.url, objective: item.objective, speculative: !!item.speculative, status: 'queued', evidence: [] }));
        run.status = 'researching'; this.event(run, 'plan', run.plan.summary);
        await this.researchItems(run.id, run.plan.workItems.filter(item => !item.speculative));
        if (!run.workers.some(worker => worker.status === 'ready' && worker.evidence.length > 0)) {
          delete run.plan.proposedAction;
          run.uncertainties.push('Primary browser research produced no evidence. No action will be prepared from this failed research.');
          this.event(run, 'research_failed', 'No primary source was captured. The action approval step is blocked.');
        }
        else {
          try { run.decision = await assessEvidence(run, this.signal(run.id), usage => { run.usage.push(usage); this.save(run); }); this.event(run, 'decision', 'Compared captured source evidence. Recommendation remains advisory.'); }
          catch { run.uncertainties.push('Evidence comparison was unavailable. Review the captured sources directly before approving any draft.'); this.save(run); }
        }
        return { runId: run.id, dispatch: false };
      } });
    const review = createStep({ id: 'review-action', inputSchema: contextSchema, outputSchema: contextSchema,
      resumeSchema: z.object({ fingerprint: z.string() }), suspendSchema: z.object({ runId: z.string(), fingerprint: z.string() }),
      execute: async ({ inputData, resumeData, suspend }) => {
        const run = this.required(inputData.runId); this.signal(run.id).throwIfAborted();
        if (!run.plan?.proposedAction) return inputData;
        if (!run.action) run.action = this.ledger.propose({ runId: run.id, ...run.plan.proposedAction });
        if (resumeData) {
          const action = this.ledger.get(run.action.id);
          if (action.fingerprint !== resumeData.fingerprint || action.status !== 'approved') throw new AuthorizationError('This workflow has no matching action approval.');
          run.action = action; run.status = 'working'; this.event(run, 'approved', 'Exact action approved. Preparing the authorized handoff.');
          return { runId: run.id, dispatch: true };
        }
        run.status = 'awaiting_approval'; this.event(run, 'approval', 'Review the exact recipient, payload and spend cap before any action.');
        return suspend({ runId: run.id, fingerprint: run.action.fingerprint });
      } });
    const delegate = createStep({ id: 'delegate-fo', inputSchema: contextSchema, outputSchema: contextSchema,
      execute: async ({ inputData }) => { if (inputData.dispatch) await this.delegate(inputData.runId); return inputData; } });
    const backup = createStep({ id: 'prepare-backups', inputSchema: contextSchema, outputSchema: contextSchema,
      execute: async ({ inputData }) => {
        const run = this.required(inputData.runId);
        await this.researchItems(run.id, run.plan?.workItems.filter(item => item.speculative) ?? []);
        return inputData;
      } });
    const finish = createStep({ id: 'summarize', inputSchema: z.any(), outputSchema: contextSchema,
      execute: async ({ inputData, getInitData }) => { const initial = getInitData() as z.infer<typeof initialSchema>; this.finish(initial.runId); return { runId: initial.runId, dispatch: false }; } });
    this.workflow = createWorkflow({ id: 'fo-chestra-parallel', inputSchema: initialSchema, outputSchema: contextSchema })
      .then(plan).then(review).parallel([delegate, backup]).then(finish).commit();
    this.sequentialWorkflow = createWorkflow({ id: 'fo-chestra-sequential', inputSchema: initialSchema, outputSchema: contextSchema })
      .then(plan).then(review).then(delegate).then(backup).then(finish).commit();
    this.mastra = new Mastra({ storage: this.storage, workflows: { parallel: this.workflow, sequential: this.sequentialWorkflow, browserBatch: this.batch, sequentialBrowserBatch: this.sequentialBatch }, logger: false });
    for (const run of this.store.list()) {
      if (run.action) { try { run.action = this.ledger.get(run.action.id); } catch { run.status = 'interrupted'; } }
      if (run.action?.status === 'outcome_unknown') { run.fo.status = 'outcome_unknown'; run.status = 'interrupted'; }
    }
  }
  required(id: string) { const run = this.store.get(id); if (!run) throw new Error('Run not found.'); return run; }
  private signal(id: string) {
    if (!this.controllers.has(id)) this.controllers.set(id, new AbortController());
    return this.controllers.get(id)!.signal;
  }
  private save(run: Run) { run.updatedAt = new Date().toISOString(); run.metrics.elapsedMs = Date.parse(run.finishedAt ?? run.updatedAt) - Date.parse(run.createdAt); this.store.save(run); this.subscribers.get(run.id)?.forEach(fn => fn(run)); }
  event(run: Run, type: string, message: string, workerId?: string) {
    const event: RunEvent = { id: (run.events.at(-1)?.id ?? 0) + 1, at: new Date().toISOString(), type, message, ...(workerId ? { workerId } : {}) };
    run.events.push(event); this.save(run);
  }
  subscribe(id: string, fn: (run: Run) => void) {
    const set = this.subscribers.get(id) ?? new Set(); set.add(fn); this.subscribers.set(id, set);
    return () => { set.delete(fn); if (!set.size) this.subscribers.delete(id); };
  }
  private track(id: string, promise: Promise<unknown>) {
    this.jobs.set(id, promise);
    void promise.catch(error => {
      const run = this.required(id);
      if (run.status === 'cancelled') return;
      run.status = 'failed'; run.error = errorText(error); run.finishedAt = new Date().toISOString(); this.event(run, 'error', run.error);
    }).finally(() => { if (this.jobs.get(id) === promise) this.jobs.delete(id); });
  }
  start(request: RunRequest): Run {
    if (this.jobs.size || this.store.list().some(run => !terminal.has(run.status))) throw new Error('Finish, reject or cancel the current run and allow browser cleanup before starting another on this laptop.');
    if (request.mode === 'live' && !process.env.ANTHROPIC_API_KEY) throw new Error('Configure ANTHROPIC_API_KEY before a live run.');
    const id = randomUUID(); const at = new Date().toISOString();
    const run: Run = { id, goal: request.goal, mode: request.mode, strategy: request.strategy ?? 'parallel', workerLimit: Math.min(this.options.maxWorkers, request.maxWorkers ?? this.options.maxWorkers), status: 'planning', createdAt: at, updatedAt: at, workers: [], events: [],
      fo: { status: 'idle', simulated: request.mode === 'sandbox' }, usage: [], uncertainties: [], metrics: { elapsedMs: 0, browserActiveMs: 0, foWaitMs: 0, overlapMs: 0, maxConcurrentWorkers: 0 } };
    this.store.save(run); this.signal(id);
    this.track(id, (async () => { const workflow = run.strategy === 'parallel' ? this.workflow : this.sequentialWorkflow;
      const execution = await workflow.createRun({ runId: id }); const result = await execution.start({ inputData: { runId: id, request } });
      if (result.status === 'failed') throw new Error('Workflow failed. Inspect the run events for the failing stage.');
    })());
    return run;
  }
  async approve(id: string, fingerprint: string) {
    const run = this.required(id);
    if (run.status !== 'awaiting_approval' || !run.action) throw new AuthorizationError('This run is not awaiting an action approval.');
    // The UI event can arrive just before Mastra flushes the suspension snapshot.
    await this.jobs.get(id);
    if (run.mode === 'live' && !this.options.liveFoEnabled) throw new AuthorizationError('Live actions are disabled in .env. Review the prepared action before enabling them.');
    if (run.mode === 'live' && !(await this.liveFo.discover()).connected) throw new AuthorizationError('Connect Fo and discover its tools before approving a live action. No action was submitted.');
    run.action = this.ledger.approve(run.action.id, run.id, fingerprint); this.save(run);
    if (run.action.target.startsWith('conversation:')) {
      run.status = 'working'; this.event(run, 'approved', 'New answer approved for the exact conversation.');
      this.track(id, this.delegate(id).then(() => this.finish(id)));
    } else {
      this.track(id, (async () => {
        const workflow = run.strategy === 'parallel' ? this.workflow : this.sequentialWorkflow;
        const execution = await workflow.createRun({ runId: id });
        const result = await execution.resume({ step: 'review-action', resumeData: { fingerprint } });
        if (result.status === 'failed') throw new Error('Resumed workflow failed; inspect the recorded action before any retry.');
      })());
    }
    return run;
  }
  reject(id: string) {
    const run = this.required(id);
    if (run.status !== 'awaiting_approval' || !run.action) throw new AuthorizationError('No pending action to reject.');
    run.action = this.ledger.reject(run.action.id, id, run.action.fingerprint);
    run.status = 'cancelled'; run.finishedAt = new Date().toISOString(); this.controllers.get(id)?.abort();
    this.event(run, 'rejected', 'Action rejected. Nothing was submitted.'); return run;
  }
  cancel(id: string) {
    const run = this.required(id); if (terminal.has(run.status)) return run;
    if (run.action && ['pending', 'approved'].includes(run.action.status)) run.action = this.ledger.reject(run.action.id, id, run.action.fingerprint);
    run.status = 'cancelled'; run.finishedAt = new Date().toISOString(); this.controllers.get(id)?.abort();
    run.workers.filter(w => ['running', 'queued'].includes(w.status)).forEach(w => w.status = 'cancelled');
    this.event(run, 'cancelled', run.fo.conversationId ? 'Local monitoring cancelled. Fo may continue remotely; cancellation does not undo a dispatched action.' : 'Local work cancelled.');
    return run;
  }
  prepareAnswer(id: string, message: string) {
    const run = this.required(id);
    if (run.status !== 'awaiting_input' || !run.fo.conversationId) throw new AuthorizationError('Fo has not requested an answer on this run.');
    run.action = this.ledger.propose({ runId: id, target: `conversation:${run.fo.conversationId}`, operation: 'inquiry', message, maxSpendCents: 0 });
    run.status = 'awaiting_approval'; this.event(run, 'approval', 'New reply prepared. Review and approve this exact reply before sending.'); return run;
  }
  replaceAction(id: string, input: { target: string; operation: 'email' | 'call' | 'inquiry'; message: string; maxSpendCents: number }) {
    const run = this.required(id);
    if (run.status !== 'awaiting_approval' || !run.action || run.action.status !== 'pending') throw new AuthorizationError('Only a pending draft can be edited.');
    if (run.action.target.startsWith('conversation:') && input.target !== run.action.target) throw new AuthorizationError('An answer must stay bound to the same conversation.');
    const replacement = this.ledger.propose({ runId: id, ...input });
    this.ledger.reject(run.action.id, id, run.action.fingerprint);
    run.action = replacement;
    this.event(run, 'action_edited', 'Prepared payload changed. Previous approval fingerprint retired; the new exact action still requires approval.');
    return run;
  }
  recordVerification(id: string, input: { observed: boolean; note: string; reference: string; method?: Verification['method']; checks?: EmailChecks }) {
    const run = this.required(id);
    const finalReport = run.fo.status === 'complete' && run.status !== 'awaiting_input';
    const uncertainSubmission = run.fo.status === 'outcome_unknown' && run.action?.status === 'outcome_unknown' && !this.jobs.has(id);
    if (!finalReport && !uncertainSubmission) throw new AuthorizationError('Record a receipt only after a final provider result or a settled unknown submission.');
    const method = input.method ?? 'human_receipt';
    if (input.checks && method !== 'operator_gmail_receipt') throw new AuthorizationError('Explicit email checks require the operator Gmail receipt method.');
    if (method === 'operator_gmail_receipt' && !input.checks) throw new AuthorizationError('Operator Gmail receipt verification requires all six explicit email checks.');
    run.verification = { status: getVerificationStatus(input.observed, input.checks), method, ...(input.checks ? { checks: { ...input.checks } } : {}), note: input.note, reference: input.reference, recordedAt: new Date().toISOString() };
    if (run.mode === 'live') run.status = run.verification.status === 'verified' && run.workers.every(worker => worker.status === 'ready') ? 'completed' : 'partial';
    run.summary = this.runSummary(run);
    this.event(run, 'verification', method === 'operator_gmail_receipt' ? `Operator supplied an independent Gmail connector receipt check: ${run.verification.status}. Gmail credentials are held by the Codex connector, not this app.` : input.observed ? 'User reports inspecting independent receipt evidence. This is a human-attested check.' : 'User reports that independent inspection did not confirm the provider outcome.');
    return run;
  }
  private async researchItems(id: string, items: WorkItem[]) {
    if (!items.length) return;
    const run = this.required(id); const pending = new Map(items.map(item => [item.id, item]));
    while (pending.size) {
      this.signal(id).throwIfAborted();
      const ready = [...pending.values()].filter(item => item.dependsOn.every(dep => run.workers.some(w => w.id === dep && w.status === 'ready')));
      if (!ready.length) {
        pending.forEach(item => { const worker = run.workers.find(w => w.id === item.id)!; worker.status = 'failed'; worker.error = 'A prerequisite did not produce evidence.'; this.event(run, 'worker_failed', worker.error, worker.id); });
        return;
      }
      ready.forEach(item => pending.delete(item.id));
      const batch = run.strategy === 'parallel' ? this.batch : this.sequentialBatch;
      const limit = run.strategy === 'sequential' ? 1 : run.workerLimit ?? this.options.maxWorkers;
      for (let index = 0; index < ready.length; index += limit) {
        this.signal(id).throwIfAborted();
        const execution = await batch.createRun(); const result = await execution.start({ inputData: ready.slice(index, index + limit).map(item => ({ runId: id, item })) });
        if (result.status === 'failed') throw new Error('Browser batch workflow failed.');
      }
    }
  }
  private async work(id: string, item: WorkItem) {
    const run = this.required(id); const worker = run.workers.find(w => w.id === item.id)!;
    const started = performance.now(); worker.status = 'running'; worker.startedAt = new Date().toISOString();
    run.metrics.maxConcurrentWorkers = Math.max(run.metrics.maxConcurrentWorkers, run.workers.filter(w => w.status === 'running').length);
    this.event(run, 'worker_started', item.speculative ? 'Preparing a speculative backup.' : 'Research worker started.', item.id);
    try {
      const result = await research(item, { mode: run.mode, fixtureOrigin: this.options.origin, signal: this.signal(id), onProgress: message => this.event(run, 'worker_progress', message, item.id), onScreenshot: buffer => {
        const directory = join(this.options.dataDir, 'screenshots', id); mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, `${item.id}.png`), buffer, { mode: 0o600 }); worker.screenshot = `/api/runs/${id}/workers/${item.id}/screenshot`; this.save(run);
      } });
      this.signal(id).throwIfAborted(); worker.evidence = result.evidence; run.usage.push(...result.usage); worker.status = 'ready';
      this.event(run, 'evidence', 'Page evidence captured; factual claims retain their source and verification state.', item.id);
    } catch (error) { worker.status = this.signal(id).aborted ? 'cancelled' : 'failed'; worker.error = errorText(error); this.event(run, 'worker_failed', worker.error, item.id); }
    finally { worker.finishedAt = new Date().toISOString(); worker.elapsedMs = Math.round(performance.now() - started); run.metrics.browserActiveMs += worker.elapsedMs; this.save(run); }
  }
  private client(run: Run): FoClient {
    if (run.mode === 'live') return this.liveFo;
    if (!this.mocks.has(run.id)) this.mocks.set(run.id, new MockFoClient({ delayMs: 1400, scenario: /question|clarif/i.test(run.goal) ? 'question' : /provider failure/i.test(run.goal) ? 'failure' : 'success' }));
    return this.mocks.get(run.id)!;
  }
  private applyReply(run: Run, reply: FoReply) {
    run.fo = { ...reply, simulated: run.mode === 'sandbox' };
    if (replyNeedsUserInput(reply)) { run.fo.status = 'awaiting_input'; if (run.status !== 'cancelled') run.status = 'awaiting_input'; }
    this.event(run, 'fo_progress', reply.progress ?? reply.response ?? `Fo status: ${reply.status}`);
  }
  private async delegate(id: string) {
    const run = this.required(id); const action = run.action!; const client = this.client(run);
    const started = performance.now(); const startedAt = Date.now(); run.status = 'working'; this.event(run, 'fo_submit', run.mode === 'sandbox' ? 'Submitting to the local simulated service.' : 'Submitting the exact approved action to Fo.');
    try {
      let reply: FoReply;
      const conversation = action.target.startsWith('conversation:') ? action.target.slice(13) : undefined;
      if (run.mode === 'live') reply = conversation ? await this.liveFo.answerApproved(action.id, id, action.fingerprint, conversation) : await this.liveFo.submitApproved(action.id, id, action.fingerprint);
      else {
        const claim = this.ledger.claim(action.id, id, action.fingerprint);
        try { reply = conversation ? await client.answer(conversation, approvedFoMessage(action)) : await client.submit(approvedFoMessage(action)); this.ledger.recordReply(claim, reply); }
        catch (error) { this.ledger.markUnknown(claim); throw error; }
      }
      run.action = this.ledger.get(action.id); this.applyReply(run, reply);
      // Bounded monitoring window; a long-running remote job is resumable with read-only polling.
      const deadline = Date.now() + 5 * 60_000;
      while (reply.status === 'working' && !replyNeedsUserInput(reply) && Date.now() < deadline) {
        this.signal(id).throwIfAborted();
        reply = await client.poll(reply.conversationId, run.mode === 'live' ? 20 : 0);
        run.action = this.ledger.recordPoll(action.id, id, reply); this.applyReply(run, reply);
      }
      if (reply.status === 'working' && !replyNeedsUserInput(reply)) { run.status = 'interrupted'; run.uncertainties.push('Monitoring window ended; remote work may continue. Resume polling without another submission.'); }
      if (reply.status === 'complete' && !replyNeedsUserInput(reply)) {
        run.uncertainties.push(run.mode === 'sandbox' ? 'The simulated Fo receipt does not represent any external action.' : 'Fo reports completion. Independently verify the real-world outcome before claiming success.');
      }
    } catch (error) {
      run.action = this.ledger.get(action.id);
      if (run.action.status === 'working' && run.fo.conversationId) {
        run.fo.status = 'working';
        if (!this.signal(id).aborted) run.status = 'interrupted';
        run.uncertainties.push('Monitoring stopped after Fo accepted the request. Resume polling this conversation; do not submit again.');
      } else run.fo.status = run.action.status === 'outcome_unknown' ? 'outcome_unknown' : 'failed';
      run.error = errorText(error); this.event(run, 'fo_error', run.error);
    } finally {
      const end = Date.now(); run.metrics.foWaitMs += Math.round(performance.now() - started);
      run.metrics.overlapMs += run.workers.reduce((total, w) => total + (w.speculative && w.startedAt ? Math.max(0, Math.min(end, Date.parse(w.finishedAt ?? new Date().toISOString())) - Math.max(startedAt, Date.parse(w.startedAt))) : 0), 0);
      this.save(run);
    }
  }
  async poll(id: string) {
    if (this.jobs.has(id)) throw new AuthorizationError('This run is already monitoring Fo. Wait for the current request to finish.');
    const run = this.required(id); if (!run.fo.conversationId || !run.action || run.mode === 'sandbox' && !this.mocks.has(id)) throw new Error('No recoverable conversation. Sandbox conversations do not survive process restart.');
    if (!['working', 'outcome_unknown'].includes(run.fo.status)) throw new Error('This conversation has no outstanding result to poll.');
    const reply = await this.client(run).poll(run.fo.conversationId, 0); run.status = 'working'; run.action = this.ledger.recordPoll(run.action.id, id, reply); this.applyReply(run, reply); this.finish(id); return run;
  }
  private finish(id: string) {
    const run = this.required(id);
    if (['cancelled', 'awaiting_approval', 'awaiting_input', 'interrupted'].includes(run.status)) return;
    const ready = run.workers.filter(w => w.status === 'ready').length;
    const failure = run.workers.some(w => w.status !== 'ready') || ['failed', 'outcome_unknown', 'working'].includes(run.fo.status) || run.mode === 'live' && run.fo.status === 'complete' && run.verification?.status !== 'verified';
    run.status = failure ? ready ? 'partial' : 'failed' : 'completed'; run.finishedAt = new Date().toISOString();
    run.summary = this.runSummary(run);
    this.event(run, 'summary', run.summary);
  }
  private runSummary(run: Run): string {
    const ready = run.workers.filter(worker => worker.status === 'ready').length;
    const verification = run.verification?.status === 'verified' ? 'Independent receipt verification recorded as verified.' : run.verification?.status === 'partial' ? 'Independent receipt checks partially confirmed the outcome; some required checks failed.' : run.verification?.status === 'uncertain' ? 'Independent receipt verification remains uncertain.' : 'Independent outcome verification is pending.';
    const outcome = run.fo.status === 'complete' ? run.mode === 'sandbox' ? 'Simulated service completed its protocol; no external action occurred.' : `Fo reported completion. ${verification}` : run.fo.status === 'idle' ? 'Research complete. No action was submitted.' : `Service state: ${run.fo.status}. ${run.verification ? verification : 'Review the recorded uncertainties.'}`;
    return `${ready}/${run.workers.length} browser sources captured. ${outcome}`;
  }
  async close() { this.controllers.forEach(c => c.abort()); await Promise.allSettled([...this.jobs.values()]); await this.liveFo.close(); await Promise.allSettled([...this.mocks.values()].map(c => c.close())); this.ledger.close(); await this.storage.close(); }
}
