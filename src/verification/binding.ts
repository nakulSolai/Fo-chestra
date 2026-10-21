import type { PreparedAction, Run } from '../shared/types.js';
import type { EmailExpectation } from './email.js';

interface PreparedEmail extends EmailExpectation { testId: string; bodySha256: string; action: Pick<PreparedAction, 'target' | 'operation' | 'message' | 'maxSpendCents'> }
interface Preparation { testId: string; runId: string; actionId: string; fingerprint: string }

/** Refuse to attribute a receipt to a different approved action or a stale preparation file. */
export function assertEmailReceiptBinding(run: Run, prepared: PreparedEmail, preparation: Preparation, proof: { receivedAt: string; expectedBodySha256: string }, now = Date.now()) {
  const action = run.action;
  if (!prepared.testId || prepared.testId !== preparation.testId || run.id !== preparation.runId || run.mode !== 'live' || run.fo.simulated ||
    !action || action.id !== preparation.actionId || action.fingerprint !== preparation.fingerprint ||
    action.target !== prepared.recipient || action.target !== prepared.action.target || action.operation !== 'email' || prepared.action.operation !== 'email' ||
    action.message !== prepared.action.message || action.maxSpendCents !== 0 || prepared.action.maxSpendCents !== 0 ||
    !action.message.includes(prepared.subject) || !action.message.includes(prepared.body) || proof.expectedBodySha256 !== prepared.bodySha256) {
    throw new Error('Receipt preparation does not match the current exact action. No verification was recorded.');
  }
  if (!['complete', 'outcome_unknown'].includes(run.fo.status) || !['complete', 'outcome_unknown'].includes(action.status)) {
    throw new Error('The matching action has no settled provider result. No verification was recorded.');
  }
  const receivedAt = Date.parse(proof.receivedAt);
  const createdAt = Date.parse(action.createdAt);
  // Gmail receipt time must follow action preparation; allow at most two minutes of future clock skew.
  if (!Number.isFinite(receivedAt) || !Number.isFinite(createdAt) || receivedAt < createdAt || receivedAt > now + 120_000) {
    throw new Error('Receipt time does not correspond to the current action. No verification was recorded.');
  }
}
