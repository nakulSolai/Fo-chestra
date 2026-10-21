import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Run } from '../shared/types.js';

export class RunStore {
  readonly runs = new Map<string, Run>();
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true });
    for (const file of readdirSync(directory).filter(f => /^[a-f0-9-]+\.json$/.test(f))) {
      try {
        const run = JSON.parse(readFileSync(join(directory, file), 'utf8')) as Run;
        if (!run.id || !Array.isArray(run.events)) continue;
        if (['planning', 'researching', 'working'].includes(run.status)) {
          run.status = 'interrupted';
          run.error = 'The local process stopped. Browser work must be restarted; existing external work must be reconciled before another submission.';
          run.workers.filter(w => w.status === 'running' || w.status === 'queued').forEach(w => { w.status = 'cancelled'; });
          if (run.fo.status === 'working') run.uncertainties.push('Fo may still be working remotely. Resume polling instead of submitting again.');
        }
        this.runs.set(run.id, run);
      } catch { /* A corrupt individual local snapshot must not stop startup. */ }
    }
  }
  save(run: Run) {
    this.runs.set(run.id, run);
    const path = join(this.directory, `${run.id}.json`);
    writeFileSync(`${path}.tmp`, JSON.stringify(run), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  }
  get(id: string) { return this.runs.get(id); }
  list() { return [...this.runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
}

export function redactForExport(run: Run): Run {
  const copy = structuredClone(run);
  const redacted = '[redacted private text]';
  const publicOrigin = (url: string) => { try { return new URL(url).origin; } catch { return '[redacted URL]'; } };
  copy.goal = redacted;
  copy.uncertainties = copy.uncertainties.map(() => redacted);
  if (copy.error) copy.error = redacted;
  if (copy.summary) copy.summary = redacted;
  if (copy.verification) {
    // Receipt method and boolean checks are non-sensitive evidence; private notes and references are not.
    copy.verification.note = redacted; copy.verification.reference = redacted;
  }
  if (copy.decision) { copy.decision.summary = redacted; copy.decision.rationale = redacted; copy.decision.alternatives.forEach(option => option.reason = redacted); copy.decision.missingInformation = copy.decision.missingInformation.map(() => redacted); }
  if (copy.plan) {
    copy.plan.summary = redacted;
    copy.plan.uncertainties = copy.plan.uncertainties.map(() => redacted);
    copy.plan.workItems.forEach(item => { item.title = redacted; item.objective = redacted; item.url = publicOrigin(item.url); });
    if (copy.plan.proposedAction) { copy.plan.proposedAction.target = redacted; copy.plan.proposedAction.message = redacted; }
  }
  copy.workers.forEach(worker => {
    delete worker.screenshot;
    worker.title = redacted; worker.objective = redacted; worker.url = publicOrigin(worker.url);
    if (worker.error) worker.error = redacted;
    worker.evidence.forEach(evidence => { evidence.title = redacted; evidence.text = redacted; evidence.url = publicOrigin(evidence.url); });
  });
  delete copy.fo.conversationId;
  if (copy.fo.response) copy.fo.response = redacted;
  if (copy.fo.progress) copy.fo.progress = redacted;
  if (copy.action) { delete copy.action.conversationId; delete copy.action.response; copy.action.target = '[redacted recipient]'; copy.action.message = '[redacted action payload]'; }
  copy.events = copy.events.map(({ detail, ...event }) => ({ ...event, message: redacted }));
  return copy;
}
