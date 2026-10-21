import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ActionLedger, AuthorizationError, fingerprintAction } from '../src/security/action-ledger.js';

const opened: ActionLedger[] = [];
const directories: string[] = [];
const create = (options?: ConstructorParameters<typeof ActionLedger>[1], path = ':memory:') => {
  const ledger = new ActionLedger(path, options); opened.push(ledger); return ledger;
};
const proposal = (runId = 'run-a', maxSpendCents = 0) => ({ runId, target: 'self@example.test', operation: 'email' as const, message: 'Send this exact inquiry to myself only.', maxSpendCents });
const approve = (ledger: ActionLedger, runId = 'run-a', cost = 0) => {
  const action = ledger.propose(proposal(runId, cost));
  return ledger.approve(action.id, action.runId, action.fingerprint);
};
function databasePath(): string {
  mkdirSync(join(process.cwd(), '.data'), { recursive: true });
  const directory = mkdtempSync(join(process.cwd(), '.data', 'test-ledger-'));
  directories.push(directory); return join(directory, 'ledger.sqlite');
}
afterEach(() => {
  for (const ledger of opened.splice(0)) { try { ledger.close(); } catch { /* A reopen test explicitly closes its first handle. */ } }
  for (const directory of directories.splice(0)) { for (const file of readdirSync(directory)) unlinkSync(join(directory, file)); rmdirSync(directory); }
});

describe('exact-action durable authorization', () => {
  it('binds approval to the exact payload, run, target and spend', () => {
    const ledger = create(); const action = ledger.propose(proposal());
    expect(fingerprintAction({ ...action, message: `${action.message} Also email someone else.` })).not.toBe(action.fingerprint);
    expect(fingerprintAction({ ...action, maxSpendCents: 1 })).not.toBe(action.fingerprint);
    expect(() => ledger.approve(action.id, 'other-run', action.fingerprint)).toThrow(AuthorizationError);
    expect(() => ledger.approve(action.id, action.runId, 'altered')).toThrow(AuthorizationError);
    expect(() => ledger.claim(action.id, action.runId, action.fingerprint)).toThrow(AuthorizationError);
    expect(ledger.get(action.id).status).toBe('pending');
  });
  it('never dispatches a rejected or expired action', () => {
    let now = new Date('2026-10-18T00:00:00Z');
    const ledger = create({ now: () => now, approvalTtlMs: 1000 });
    const rejected = ledger.propose(proposal()); ledger.reject(rejected.id, rejected.runId, rejected.fingerprint);
    expect(() => ledger.approve(rejected.id, rejected.runId, rejected.fingerprint)).toThrow();
    const expired = approve(ledger); now = new Date(now.getTime() + 1001);
    expect(() => ledger.claim(expired.id, expired.runId, expired.fingerprint)).toThrow(/expired/);
  });
  it('allows only one claim across independent connections', async () => {
    const path = databasePath(); const first = create(undefined, path); const second = create(undefined, path);
    const action = approve(first);
    const results = await Promise.allSettled([first, second].map(ledger => Promise.resolve().then(() => ledger.claim(action.id, action.runId, action.fingerprint))));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  });
  it('reserves spend before submission and retains it after a provider-reported failure', () => {
    const ledger = create({ budgetCents: 100 });
    const first = approve(ledger, 'budget-run', 60);
    const secondPending = ledger.propose({ ...proposal('budget-run', 60), target: 'another@example.test' });
    const second = ledger.approve(secondPending.id, secondPending.runId, secondPending.fingerprint);
    const claim = ledger.claim(first.id, first.runId, first.fingerprint);
    expect(ledger.reservedCents('budget-run')).toBe(60);
    expect(() => ledger.claim(second.id, second.runId, second.fingerprint)).toThrow(/cap/);
    ledger.recordReply(claim, { status: 'failed', conversationId: 'server-failure', response: 'Provider reports failure.' });
    expect(ledger.reservedCents('budget-run')).toBe(60);
    expect(ledger.reservedTotalCents()).toBe(60);
    expect(() => ledger.claim(second.id, second.runId, second.fingerprint)).toThrow(/cap/);
  });
  it('cannot bypass the total cap by starting a different run', () => {
    const ledger = create({ budgetCents: 100 });
    const first = approve(ledger, 'first-run', 60);
    const secondPending = ledger.propose({ ...proposal('second-run', 60), target: 'another@example.test' });
    const second = ledger.approve(secondPending.id, secondPending.runId, secondPending.fingerprint);
    ledger.claim(first.id, first.runId, first.fingerprint);
    expect(ledger.reservedTotalCents()).toBe(60);
    expect(() => ledger.claim(second.id, second.runId, second.fingerprint)).toThrow(/ledger spend cap/);
  });
  it('keeps interrupted submission unknown after reopening and prevents resubmission', () => {
    const path = databasePath(); const first = create(undefined, path); const action = approve(first);
    first.claim(action.id, action.runId, action.fingerprint); first.close();
    const reopened = create(undefined, path);
    expect(reopened.get(action.id).status).toBe('outcome_unknown');
    expect(() => reopened.claim(action.id, action.runId, action.fingerprint)).toThrow(/already been dispatched|reconciliation/);
    const recreated = approve(reopened, 'new-run');
    expect(() => reopened.claim(recreated.id, recreated.runId, recreated.fingerprint)).toThrow(/identical action/);
  });
  it('retains a server conversation for polling after reopening', () => {
    const path = databasePath(); const first = create(undefined, path); const action = approve(first);
    const claim = first.claim(action.id, action.runId, action.fingerprint);
    first.recordReply(claim, { status: 'working', conversationId: 'server-123', progress: 'Accepted.' }); first.close();
    const reopened = create(undefined, path);
    expect(reopened.findConversation('server-123')?.runId).toBe(action.runId);
    expect(() => reopened.recordPoll(action.id, action.runId, { status: 'complete', conversationId: 'wrong' })).toThrow();
    expect(reopened.recordPoll(action.id, action.runId, { status: 'complete', conversationId: 'server-123', response: 'Provider completion.' }).status).toBe('complete');
  });
  it('rejects altered stored payloads and invalid money values', () => {
    const path = databasePath(); const ledger = create(undefined, path); const action = ledger.propose(proposal());
    const db = new DatabaseSync(path);
    db.prepare('UPDATE authorized_actions SET payload = ? WHERE id = ?').run(JSON.stringify({ ...proposal(), target: 'other@example.test' }), action.id); db.close();
    expect(() => ledger.get(action.id)).toThrow(/integrity/);
    for (const cost of [-1, NaN, Infinity, 0.5]) expect(() => ledger.propose(proposal('bad', cost))).toThrow();
  });
});
