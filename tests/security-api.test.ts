import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionLedger } from '../src/security/action-ledger.js';
import type { RunEngine } from '../src/server/engine.js';
import { createApp } from '../src/server/app.js';

vi.mock('../src/browser/index.js', () => ({ getBrowserReadiness: async () => ({ ready: false, message: 'Not launched during authorization tests.' }) }));
const opened: ActionLedger[] = [];
afterEach(() => { for (const ledger of opened.splice(0)) ledger.close(); });
function boundary() {
  const runId = '00000000-0000-4000-8000-000000000001';
  const ledger = new ActionLedger(':memory:'); opened.push(ledger);
  const action = ledger.propose({ runId, target: 'myself@example.test', operation: 'email', message: 'The reviewed message.', maxSpendCents: 0 });
  const approve = vi.fn(async (id: string, fingerprint: string) => ledger.approve(action.id, id, fingerprint));
  const engine = {
    options: { origin: 'http://127.0.0.1:4318', maxWorkers: 2, liveFoEnabled: false, dataDir: '.data' },
    store: { get: (id: string) => id === runId ? { id: runId, action } : undefined }, approve,
  } as unknown as RunEngine;
  const app = createApp(engine);
  const post = (payload: unknown, headers: Record<string, string> = {}) => app.request(`http://127.0.0.1:4318/api/runs/${runId}/approve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4318', ...headers }, body: JSON.stringify(payload),
  });
  return { ledger, action, approve, post };
}
describe('local approval HTTP boundary', () => {
  it('blocks foreign origins and rebinding hosts before approval', async () => {
    const { action, approve, post } = boundary();
    expect((await post({ fingerprint: action.fingerprint }, { Origin: 'https://untrusted.example' })).status).toBe(403);
    expect((await post({ fingerprint: action.fingerprint }, { Host: 'untrusted.example:4318' })).status).toBe(403);
    expect(approve).not.toHaveBeenCalled();
  });
  it('rejects payload alteration, extra authority fields and forged fingerprints', async () => {
    const { ledger, action, post } = boundary();
    expect((await post({ fingerprint: action.fingerprint, target: 'other@example.test', approved: true })).status).toBe(400);
    expect((await post({ fingerprint: 'a'.repeat(64) })).status).toBe(403);
    expect(ledger.get(action.id).status).toBe('pending');
    const valid = await post({ fingerprint: action.fingerprint });
    expect(valid.status).toBe(200); expect(ledger.get(action.id).status).toBe('approved');
    expect((await post({ fingerprint: action.fingerprint })).status).toBe(403);
  });
  it('requires JSON and bounds request bodies without submitting an action', async () => {
    const { approve, post } = boundary();
    expect((await post({ fingerprint: 'a'.repeat(64) }, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await post({ message: 'a'.repeat(33_000) })).status).toBe(413);
    expect(approve).not.toHaveBeenCalled();
  });
});
