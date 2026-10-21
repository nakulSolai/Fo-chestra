import { describe, expect, it } from 'vitest';
import type { Run } from '../src/shared/types.js';
import { recordingRun } from '../web/recording';

const privateText = 'PRIVATE_RECORDING_SENTINEL';
const recipient = 'sensitive-recipient@example.test';
const privateUrl = `https://${privateText}:${privateText}@source.example.test/${privateText}?recipient=${recipient}#${privateText}`;

function liveRun(): Run {
  const at = '2026-10-19T05:34:51.057Z';
  return {
    id: '00000000-0000-4000-8000-000000000001', goal: privateText, mode: 'live', strategy: 'parallel', status: 'partial', workerLimit: 1,
    createdAt: at, updatedAt: at, finishedAt: at, summary: privateText, error: privateText, uncertainties: [privateText],
    plan: { summary: privateText, uncertainties: [privateText], workItems: [{ id: 'source-a', title: privateText, url: privateUrl, objective: privateText, dependsOn: [] }],
      proposedAction: { target: recipient, operation: 'email', message: privateText, maxSpendCents: 0 } },
    decision: { summary: privateText, rationale: privateText, recommendedWorkerId: 'source-a',
      alternatives: [{ workerId: 'source-b', reason: privateText }], missingInformation: [privateText] },
    workers: [{ id: 'source-a', title: privateText, url: privateUrl, objective: privateText, status: 'ready', speculative: false,
      startedAt: at, finishedAt: at, elapsedMs: 9531, screenshot: `/api/${privateText}/screenshot`, error: privateText,
      evidence: [{ id: 'observation-a', workerId: 'source-a', title: privateText, url: privateUrl, text: privateText, capturedAt: at, source: 'browser', verified: false }] }],
    action: { id: 'approved-action', runId: '00000000-0000-4000-8000-000000000001', target: recipient, operation: 'email', message: privateText,
      maxSpendCents: 0, fingerprint: '1'.repeat(64), status: 'complete', createdAt: at, conversationId: privateText, response: privateText },
    fo: { status: 'complete', simulated: false, conversationId: privateText, progress: privateText, response: privateText, elapsedSeconds: 18 },
    verification: { status: 'partial', method: 'operator_gmail_receipt', checks: { deliveryObserved: true, recipientMatches: true, subjectMatches: true, bodyMatches: false, noAttachments: true, plainTextOnly: false },
      note: privateText, reference: `${privateUrl}&email=${recipient}`, recordedAt: at },
    events: [{ id: 1, at, type: 'verification', workerId: 'source-a', message: privateText,
      detail: { recipient, nested: { confidential: privateText }, transcript: [privateText] } }],
    usage: [{ model: 'anthropic/claude-sonnet-5-5', requests: 1, inputTokens: 1628, outputTokens: 594, latencyMs: 7528, retries: 0, estimatedCostUsd: null }],
    metrics: { elapsedMs: 494894, browserActiveMs: 9531, foWaitMs: 18166, overlapMs: 0, maxConcurrentWorkers: 1 },
  };
}

describe('recording-only privacy projection', () => {
  it('removes private live text and images while preserving historical results and independently recorded receipt checks', () => {
    const original = liveRun(); const snapshot = structuredClone(original);
    const visible = recordingRun(original);
    expect(visible).not.toBe(original);
    expect(JSON.stringify(visible)).not.toContain(privateText);
    expect(JSON.stringify(visible)).not.toContain(recipient);
    expect(original).toEqual(snapshot);
    expect(visible.id).toBe(original.id); expect(visible.mode).toBe('live'); expect(visible.strategy).toBe(original.strategy);
    expect(visible.status).toBe('partial'); expect(visible.fo.status).toBe('complete'); expect(visible.action?.status).toBe('complete');
    expect(visible.fo.simulated).toBe(false); expect(visible.verification?.status).toBe('partial');
    expect(visible.verification?.method).toBe('operator_gmail_receipt'); expect(visible.verification?.checks).toEqual(original.verification!.checks);
    expect(visible.verification?.recordedAt).toBe(original.verification!.recordedAt);
    expect(visible.metrics).toEqual(original.metrics); expect(visible.usage).toEqual(original.usage); expect(visible.workerLimit).toBe(1);
    expect(visible.createdAt).toBe(original.createdAt); expect(visible.finishedAt).toBe(original.finishedAt);
    expect(visible.workers).toHaveLength(1); expect(visible.workers[0]!.status).toBe('ready');
    expect(visible.workers[0]!.evidence[0]!.source).toBe('browser'); expect(visible.workers[0]!.evidence[0]!.verified).toBe(false);
    expect(visible.workers[0]).not.toHaveProperty('screenshot'); expect(visible.events[0]).not.toHaveProperty('detail');
    expect(visible.workers[0]!.url).toBe('https://source.example.test');
    expect(visible.workers[0]!.evidence[0]!.url).toBe('https://source.example.test');
    expect(visible.plan?.workItems[0]!.url).toBe('https://source.example.test');
    expect(visible.metrics).not.toBe(original.metrics); expect(visible.usage).not.toBe(original.usage);
    expect(visible.verification?.checks).not.toBe(original.verification!.checks);
  });

  it('leaves sandbox runs unchanged, including their inspectable fixture evidence', () => {
    const sandbox = { ...liveRun(), mode: 'sandbox' as const, fo: { status: 'complete' as const, simulated: true, response: 'Simulated fixture response.' } };
    const snapshot = structuredClone(sandbox);
    expect(recordingRun(sandbox)).toBe(sandbox);
    expect(sandbox).toEqual(snapshot);
  });
});
