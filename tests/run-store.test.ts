import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { RunStore, redactForExport } from '../src/server/store.js';
import type { Run } from '../src/shared/types.js';

function sample(): Run { return { id: '11111111-1111-4111-8111-111111111111', goal: 'Research an option', mode: 'live', strategy: 'parallel', status: 'working', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), workers: [{ id: 'alpha', title: 'Vendor', url: 'https://example.com', objective: 'Read', status: 'running', speculative: false, evidence: [] }], events: [], fo: { status: 'working', simulated: false, conversationId: 'private-id' }, usage: [], uncertainties: [], metrics: { elapsedMs: 0, browserActiveMs: 0, foWaitMs: 0, overlapMs: 0, maxConcurrentWorkers: 1 } }; }
describe('run snapshots', () => {
  it('restores interrupted work without automatically resubmitting a remote action', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fo-store-'));
    try { const store = new RunStore(directory); store.save(sample()); const restored = new RunStore(directory).get(sample().id)!;
      expect(restored.status).toBe('interrupted'); expect(restored.workers[0].status).toBe('cancelled'); expect(restored.fo.conversationId).toBe('private-id'); expect(restored.uncertainties.join(' ')).toContain('Resume polling');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('removes action recipients, payloads and conversation identifiers from export', () => {
    const run = sample(); run.action = { id: 'action', runId: run.id, target: 'private@example.com', operation: 'email', message: 'Private payload', maxSpendCents: 0, fingerprint: 'abc', status: 'working', createdAt: run.createdAt, conversationId: 'private-id' };
    const exported = JSON.stringify(redactForExport(run)); expect(exported).not.toContain('private@example.com'); expect(exported).not.toContain('Private payload'); expect(exported).not.toContain('private-id'); expect(run.action.target).toBe('private@example.com');
  });
});
