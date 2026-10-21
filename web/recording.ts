import type { Run } from '../src/shared/types';

/** Presentation-only redaction; original local evidence and dispatch records are never changed. */
export function recordingRun(source: Run): Run {
  if (source.mode !== 'live') return source;
  const run = structuredClone(source);
  const hidden = 'Private text hidden for recording.';
  const origin = (url: string) => { try { return new URL(url).origin; } catch { return ''; } };
  run.goal = 'Historical live email test — saved execution evidence';
  run.summary = 'Saved provider and independent verification results are shown separately below. Private communications are hidden; original statuses and receipt checks are preserved.';
  run.uncertainties = [];
  if (run.error) run.error = hidden;
  if (run.plan) {
    run.plan.summary = 'Historical plan text hidden for recording. Original workflow and outcome states are preserved.';
    run.plan.uncertainties = [];
    run.plan.workItems.forEach(item => { item.title = 'Historical browser research'; item.objective = hidden; item.url = origin(item.url); });
    if (run.plan.proposedAction) { run.plan.proposedAction.target = '[recipient hidden]'; run.plan.proposedAction.message = hidden; }
  }
  if (run.decision) {
    run.decision.summary = 'Source review recorded in the earlier run'; run.decision.rationale = hidden;
    run.decision.alternatives.forEach(item => { item.reason = hidden; }); run.decision.missingInformation = [];
  }
  run.workers.forEach(worker => {
    worker.title = 'Historical browser research'; worker.objective = hidden; worker.url = origin(worker.url); delete worker.screenshot;
    if (worker.error) worker.error = hidden;
    worker.evidence.forEach(item => { item.title = 'Earlier source observation'; item.text = hidden; item.url = origin(item.url); });
  });
  if (run.action) {
    run.action.target = '[private recipient hidden]'; run.action.message = 'Approved payload hidden for recording; the original remains in the private local ledger.';
    delete run.action.response; delete run.action.conversationId;
  }
  delete run.fo.conversationId;
  if (run.fo.response) run.fo.response = 'Saved Fo-reported response hidden for recording. Refer to the original provider status and independent receipt checks.';
  if (run.fo.progress) run.fo.progress = 'Historical Fo execution; this view does not submit another action.';
  if (run.verification) {
    run.verification.reference = 'Independent Gmail receipt; immutable message reference retained privately.';
    run.verification.note = run.verification.checks?.deliveryObserved
      ? 'The separate Gmail connector observed delivery. Inspect the recorded checks below: delivery and exact-content compliance are separate requirements.'
      : 'Independent verification results from the earlier run are preserved below.';
  }
  run.events = run.events.map(({ detail, ...event }) => ({ ...event, message: `Historical ${event.type.replaceAll('_', ' ')} event. Private text hidden.` }));
  return run;
}
