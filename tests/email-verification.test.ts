import { describe, expect, it } from 'vitest';
import { inspectEmailReceipt, getVerificationStatus, type GmailReceipt } from '../src/verification/email.js';

const expectation = { recipient: 'owner@example.test', subject: 'Authorized test unique-123', body: 'An authorized test.\nNo reply is required.' };
function receipt(): GmailReceipt {
  return { id: 'gmail-immutable-id', internal_date: '1792387100000', label_ids: ['INBOX'], payload: { mime_type: 'text/plain', filename: '',
    headers: [{ name: 'To', value: expectation.recipient }, { name: 'Delivered-To', value: expectation.recipient }, { name: 'Subject', value: expectation.subject }, { name: 'From', value: 'Sender <sender@example.test>' }],
    body: { content: expectation.body.replaceAll('\n', '\r\n') + '\r\n' } } };
}
describe('independent destination receipt verification', () => {
  it('verifies the approved recipient, subject and full plain-text wording with no attachments', () => {
    const result = inspectEmailReceipt(receipt(), expectation);
    expect(result.overallResult).toBe('verified'); expect(Object.values(result.checks).every(Boolean)).toBe(true);
    expect(result.expectedBodySha256).toBe(result.actualBodySha256); expect(result.gmailMessageId).toBe('gmail-immutable-id');
  });
  it('reports actual delivery as partial when the provider appends a signature and HTML alternative', () => {
    const mail = receipt(); mail.payload.mime_type = 'multipart/alternative';
    mail.payload.parts = [{ mime_type: 'text/plain', body: { content: expectation.body + '\n\n--\nProvider signature and promotional link' } }, { mime_type: 'text/html', body: { content: '<p>Test and provider signature</p>' } }];
    mail.payload.body = {};
    const result = inspectEmailReceipt(mail, expectation);
    expect(result.checks.deliveryObserved).toBe(true); expect(result.checks.subjectMatches).toBe(true); expect(result.approvedBodyPresent).toBe(true);
    expect(result.checks.bodyMatches).toBe(false); expect(result.checks.plainTextOnly).toBe(false); expect(result.checks.noAttachments).toBe(true);
    expect(result.overallResult).toBe('partial'); expect(result.actualBodySha256).not.toBe(result.expectedBodySha256);
  });
  it('does not treat a sent-only copy as independent receipt evidence', () => {
    const mail = receipt(); mail.label_ids = ['SENT'];
    expect(inspectEmailReceipt(mail, expectation).overallResult).toBe('uncertain');
    mail.label_ids = ['INBOX', 'SENT'];
    expect(inspectEmailReceipt(mail, expectation).overallResult).toBe('verified');
  });
  it('rejects an unexpected inline binary payload even without attachment metadata', () => {
    const mail = receipt(); mail.payload.mime_type = 'multipart/mixed'; mail.payload.body = {};
    mail.payload.parts = [{ mime_type: 'text/plain', body: { content: expectation.body } }, { mime_type: 'application/octet-stream', body: { base64_url_content: 'dW5leHBlY3RlZA' } }];
    const result = inspectEmailReceipt(mail, expectation);
    expect(result.checks.noAttachments).toBe(false); expect(result.checks.plainTextOnly).toBe(false); expect(result.overallResult).toBe('partial');
  });
  it('keeps a wrong subject, extra visible recipient or attachment from passing', () => {
    const mail = receipt(); mail.payload.headers!.find(header => header.name === 'Subject')!.value = 'Different subject';
    mail.payload.headers!.push({ name: 'Cc', value: 'other@example.test' });
    mail.payload.parts = [{ mime_type: 'application/pdf', filename: 'unexpected.pdf', body: { attachment_id: 'attachment-id' } }];
    const result = inspectEmailReceipt(mail, expectation);
    expect(result.checks.subjectMatches).toBe(false); expect(result.checks.recipientMatches).toBe(false); expect(result.checks.noAttachments).toBe(false); expect(result.overallResult).toBe('partial');
  });
  it('never promotes an unsuccessful or incomplete check to success', () => {
    expect(getVerificationStatus(false)).toBe('uncertain');
    const checks = inspectEmailReceipt(receipt(), expectation).checks;
    expect(getVerificationStatus(true, { ...checks, bodyMatches: false })).toBe('partial');
    expect(getVerificationStatus(true, { ...checks, deliveryObserved: false })).toBe('uncertain');
    expect(getVerificationStatus(true, { deliveryObserved: true } as typeof checks)).toBe('partial');
  });
});
