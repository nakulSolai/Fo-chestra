import { useState } from 'react';
import { ArrowUpRight, Check, FlaskConical, ShieldCheck, ShieldQuestion, TriangleAlert, X } from 'lucide-react';
import type { Run } from '../src/shared/types';
import { safeUrl, time } from './format';

const receiptCriteria = [
  ['deliveryObserved', 'Delivered message observed'],
  ['recipientMatches', 'Approved recipient matches'],
  ['subjectMatches', 'Approved subject matches'],
  ['bodyMatches', 'Approved body matches exactly'],
  ['noAttachments', 'No attachments'],
  ['plainTextOnly', 'Plain text only'],
] as const;

type Verification = NonNullable<Run['verification']>;

function outcomeLabel(run: Run, verification: Verification): string {
  if (run.mode === 'sandbox') {
    if (verification.status === 'verified') return 'Sandbox check: outcome observed';
    if (verification.status === 'partial') return 'Sandbox check: requirements differ';
    return 'Sandbox check: outcome unconfirmed';
  }
  if (verification.status === 'uncertain') return 'Outcome unconfirmed';
  if (verification.method === 'operator_gmail_receipt') {
    if (verification.checks?.deliveryObserved) {
      return verification.status === 'partial' || receiptCriteria.some(([key]) => !verification.checks![key])
        ? 'Delivery verified; content requirements differ'
        : 'Delivery and required constraints verified';
    }
    return 'Outcome unconfirmed';
  }
  if (verification.status === 'verified') return 'Human-reported outcome observed';
  if (verification.status === 'partial') return 'Human-reported outcome partly observed';
  return 'Outcome unconfirmed';
}

export function VerificationPanel({ run, pending, onAction }: {
  run: Run;
  pending: boolean;
  onAction: (operation: string, body?: unknown) => Promise<void>;
}) {
  const [opened, setOpened] = useState(false);
  const [checked, setChecked] = useState(false);
  const [observed, setObserved] = useState('');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  if (run.fo.status !== 'complete') return null;
  const verification = run.verification;
  const operatorReceipt = verification?.method === 'operator_gmail_receipt';

  return <section className={`verification-panel verification-${verification?.status ?? 'unrecorded'}`} data-testid="verification-panel">
    <div className="section-heading">
      <h2><ShieldQuestion size={16} />{run.mode === 'sandbox' ? 'Check the simulated outcome' : 'Independent outcome check'}</h2>
      {run.mode === 'sandbox' && <span><FlaskConical size={12} />Sandbox</span>}
    </div>
    {verification ? <div className="recorded-verification">
      <strong data-testid="verification-outcome">
        {verification.status === 'verified' ? <Check size={16} /> : verification.status === 'partial' ? <TriangleAlert size={16} /> : <ShieldQuestion size={16} />}
        {outcomeLabel(run, verification)}
      </strong>
      <p>{verification.note}</p>
      {verification.checks && <div className="receipt-checks" data-testid="receipt-checks">
        <h3>Independent receipt checks</h3>
        <p>Delivery and payload compliance are separate checks against the approved action.</p>
        <ul>
          {receiptCriteria.map(([key, label]) => {
            const passed = verification.checks![key];
            return <li key={key} className={passed ? 'receipt-check-pass' : 'receipt-check-fail'} data-testid={`receipt-check-${key}`}>
              <span>{passed ? <Check size={13} /> : <X size={13} />}{label}</span>
              <strong>{passed ? 'Pass' : key === 'deliveryObserved' ? 'Not observed' : 'Not met'}</strong>
            </li>;
          })}
        </ul>
      </div>}
      <div className="receipt-reference">
        <span>Source reference</span>
        {safeUrl(verification.reference)
          ? <a href={safeUrl(verification.reference)} target="_blank" rel="noreferrer">{verification.reference}<ArrowUpRight size={12} /></a>
          : <span className="verification-reference">{verification.reference}</span>}
      </div>
      <small>Recorded {time(verification.recordedAt)} · {operatorReceipt ? 'Operator Gmail receipt check' : 'Human attestation'}
        {run.mode === 'sandbox' ? ' · Does not verify an external action' : operatorReceipt ? ' · Separate from the Fo response' : ' · Not an automated destination check'}
      </small>
    </div> : <>
      <p className="panel-description">{run.mode === 'sandbox'
        ? 'Fo and the outcome are simulated. Record your own fixture inspection as a rehearsal, without claiming an external action occurred.'
        : 'Fo reported completion. Inspect a destination receipt, confirmation or other independent source before recording what happened.'}</p>
      {!opened ? <button className="secondary-button" onClick={() => setOpened(true)} data-testid="open-verification"><ShieldCheck size={14} />Record independent check</button> : <form className="verification-form" onSubmit={event => {
        event.preventDefault();
        if (checked && observed && note.trim() && reference.trim()) void onAction('verify', { confirmed: true, observed: observed === 'yes', note: note.trim(), reference: reference.trim() });
      }}>
        <label className="checkbox-label"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} required data-testid="verification-attestation" />
          {run.mode === 'sandbox' ? 'I personally inspected the fixture outcome separately from the simulated Fo response.' : "I personally inspected an independent source, beyond Fo's response."}
        </label>
        <label htmlFor="verification-observed">Was the intended outcome observed?</label>
        <select id="verification-observed" required value={observed} onChange={event => setObserved(event.target.value)}>
          <option value="" disabled>Select what you observed</option>
          <option value="yes">Yes, I observed the outcome</option>
          <option value="no">Not confirmed by my inspection</option>
        </select>
        {observed === 'no' && <p className="verification-uncertain-note">This records an unconfirmed outcome. It does not assert that delivery failed.</p>}
        <label htmlFor="verification-reference">Independent source reference</label>
        <input id="verification-reference" data-testid="verification-reference" value={reference} onChange={event => setReference(event.target.value)} minLength={3} maxLength={500} required placeholder="Receipt reference, confirmation URL, or fixture source" />
        <label htmlFor="verification-note">What did you check?</label>
        <textarea id="verification-note" data-testid="verification-note" value={note} onChange={event => setNote(event.target.value)} rows={3} minLength={10} maxLength={2000} required placeholder="Describe the evidence and what it confirms. Omit private details." />
        <div>
          <button className="text-button" type="button" onClick={() => setOpened(false)}>Cancel</button>
          <button type="submit" className="secondary-button" disabled={pending || !checked || !observed || note.trim().length < 10 || reference.trim().length < 3} data-testid="record-verification">Record my observation<Check size={13} /></button>
        </div>
      </form>}
    </>}
  </section>;
}
