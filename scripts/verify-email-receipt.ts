import { readFileSync, writeFileSync } from 'node:fs';
import { inspectEmailReceipt, type GmailReceipt } from '../src/verification/email.js';
import { assertEmailReceiptBinding } from '../src/verification/binding.js';
import { api } from './smoke.js';
import type { Run } from '../src/shared/types.js';

// Inputs are a real read-only Gmail connector result and the locally approved email specification.
// This script has no Fo submission path and never sends or retries an email.
const message = JSON.parse(readFileSync('.data/validation/gmail-message.json', 'utf8')) as GmailReceipt;
const prepared = JSON.parse(readFileSync('.data/validation/prepared-email.json', 'utf8'));
const live = JSON.parse(readFileSync('.data/validation/live-preparation.json', 'utf8'));
const proof = { ...inspectEmailReceipt(message, prepared), testId: prepared.testId, runId: live.runId, actionId: live.actionId, fingerprint: live.fingerprint, checkedAt: new Date().toISOString() };
const current = await api<Run>(`/api/runs/${live.runId}`);
assertEmailReceiptBinding(current, prepared, live, proof);
writeFileSync('.data/validation/email-delivery.json', JSON.stringify(proof, null, 2), { mode: 0o600 });
const allMatched = proof.overallResult === 'verified';
const note = proof.checks.deliveryObserved
  ? allMatched ? 'Independently read the Gmail receipt. Recipient, exact subject, normalized full body, no attachments and plain-text format match the approved action.'
    : `Gmail independently confirms delivery. Checks that did not pass: ${Object.entries(proof.checks).filter(([, passed]) => !passed).map(([name]) => name).join(', ')}. ${proof.approvedBodyPresent && proof.additionalPlainText ? 'The approved text is present with additional unapproved text. ' : ''}${proof.mimeTypes.includes('text/html') ? 'An HTML alternative is present. ' : ''}The full receipt and body hashes are recorded in the private proof. No resend was attempted.`
  : 'The available Gmail evidence does not independently confirm delivery. Outcome remains uncertain; no resend was attempted.';
const run = await api<Run>(`/api/runs/${live.runId}/verify`, { confirmed: true, observed: allMatched, method: 'operator_gmail_receipt', checks: proof.checks,
  reference: `Gmail message ${proof.gmailMessageId}; received ${proof.receivedAt}`, note });
console.log(JSON.stringify({ runId: run.id, runStatus: run.status, verification: run.verification, additionalFoSubmissions: 0 }, null, 2));
