import { describe, expect, it } from 'vitest';
import { assertEmailReceiptBinding } from '../src/verification/binding.js';
import type { Run } from '../src/shared/types.js';

const prepared = { testId: 'unique-id', recipient: 'owner@example.test', subject: 'Unique subject', body: 'Approved exact body', bodySha256: 'expected-hash',
  action: { target: 'owner@example.test', operation: 'email' as const, message: 'Unique subject\nApproved exact body', maxSpendCents: 0 } };
const preparation = { testId: 'unique-id', runId: 'run-id', actionId: 'action-id', fingerprint: 'exact-fingerprint' };
const run = { id: 'run-id', mode: 'live', fo: { simulated: false, status: 'complete' }, action: { ...prepared.action, id: 'action-id', fingerprint: 'exact-fingerprint', status: 'complete', createdAt: '2026-10-19T05:00:00.000Z' } } as Run;
const proof = { receivedAt: '2026-10-19T05:01:00.000Z', expectedBodySha256: 'expected-hash' };
const now = Date.parse('2026-10-19T05:02:00.000Z');

describe('receipt correlation to the approved action', () => {
  it('accepts a matching settled action and a later receipt', () => {
    expect(() => assertEmailReceiptBinding(run, prepared, preparation, proof, now)).not.toThrow();
  });
  it('rejects overwritten preparation, different action, altered payload and simulation', () => {
    expect(() => assertEmailReceiptBinding(run, prepared, { ...preparation, testId: 'another-test' }, proof, now)).toThrow(/does not match/);
    expect(() => assertEmailReceiptBinding(run, prepared, { ...preparation, fingerprint: 'another-action' }, proof, now)).toThrow(/does not match/);
    expect(() => assertEmailReceiptBinding(run, { ...prepared, action: { ...prepared.action, message: 'Changed payload' } }, preparation, proof, now)).toThrow(/does not match/);
    expect(() => assertEmailReceiptBinding({ ...run, fo: { ...run.fo, simulated: true } }, prepared, preparation, proof, now)).toThrow(/does not match/);
  });
  it('rejects an old receipt, an unbounded future timestamp or unsettled submission', () => {
    expect(() => assertEmailReceiptBinding(run, prepared, preparation, { ...proof, receivedAt: '2026-10-19T04:59:59.000Z' }, now)).toThrow(/Receipt time/);
    expect(() => assertEmailReceiptBinding(run, prepared, preparation, { ...proof, receivedAt: '2026-10-19T05:05:00.000Z' }, now)).toThrow(/Receipt time/);
    expect(() => assertEmailReceiptBinding({ ...run, fo: { ...run.fo, status: 'working' } }, prepared, preparation, proof, now)).toThrow(/settled/);
  });
});
