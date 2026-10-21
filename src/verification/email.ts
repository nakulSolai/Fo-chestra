import { createHash } from 'node:crypto';
import type { EmailChecks } from '../shared/types.js';

export interface GmailPart {
  mime_type?: string; filename?: string;
  headers?: { name: string; value: string }[];
  body?: { content?: string | null; base64_url_content?: string | null; attachment_id?: string | null };
  parts?: GmailPart[] | null;
}
export interface GmailReceipt { id: string; internal_date: string; label_ids: string[]; payload: GmailPart }
export interface EmailExpectation { recipient: string; subject: string; body: string }

/** Transport line endings and a final newline do not alter wording. Signatures are never stripped. */
export function normalizeEmailBody(value: string): string { return value.replace(/\r\n?/g, '\n').trimEnd(); }

export function getVerificationStatus(observed: boolean, checks?: EmailChecks): 'verified' | 'partial' | 'uncertain' {
  if (!checks) return observed ? 'verified' : 'uncertain';
  if (!checks.deliveryObserved) return 'uncertain';
  return observed && ['deliveryObserved', 'recipientMatches', 'subjectMatches', 'bodyMatches', 'noAttachments', 'plainTextOnly']
    .every(key => checks[key as keyof EmailChecks] === true) ? 'verified' : 'partial';
}

/** Inspect a real read-only Gmail result, independently of the provider's success report. */
export function inspectEmailReceipt(receipt: GmailReceipt, expected: EmailExpectation) {
  if (!receipt || typeof receipt.id !== 'string' || !receipt.id || !receipt.payload || !Array.isArray(receipt.label_ids) ||
    !/^\d{10,16}$/.test(receipt.internal_date) || !expected || typeof expected.body !== 'string' || typeof expected.subject !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expected.recipient)) throw new Error('Invalid email receipt or expectation.');
  const received = new Date(Number(receipt.internal_date));
  if (!Number.isFinite(received.getTime())) throw new Error('Gmail receipt timestamp is invalid.');
  const parts: GmailPart[] = [];
  const seen = new Set<GmailPart>();
  function visit(part: GmailPart, depth = 0) {
    if (!part || typeof part !== 'object' || seen.has(part) || depth > 16 || parts.length >= 100) throw new Error('Gmail MIME structure is invalid or too large.');
    seen.add(part); parts.push(part);
    for (const child of part.parts ?? []) visit(child, depth + 1);
  }
  visit(receipt.payload);
  const header = (name: string) => (receipt.payload.headers ?? []).filter(entry => entry.name.toLowerCase() === name.toLowerCase()).map(entry => entry.value).join(', ');
  const addresses = (value: string): string[] => value.toLowerCase().match(/[^\s<>(),;:"]+@[^\s<>(),;:"]+\.[^\s<>(),;:"]+/g) ?? [];
  const recipient = expected.recipient.toLowerCase();
  const to = addresses(header('to'));
  const deliveredTo = addresses(header('delivered-to'));
  const plainParts = parts.filter(part => part.mime_type === 'text/plain');
  const leaves = parts.filter(part => !part.parts?.length);
  const sentOnly = receipt.label_ids.includes('SENT') && !receipt.label_ids.includes('INBOX');
  const body = plainParts.map(part => {
    const content = typeof part.body?.content === 'string' ? part.body.content : part.body?.base64_url_content ? Buffer.from(part.body.base64_url_content, 'base64url').toString('utf8') : '';
    if (content.length > 256_000) throw new Error('Gmail receipt text exceeds the verification bound.');
    return normalizeEmailBody(content);
  }).join('\n');
  const approvedBody = normalizeEmailBody(expected.body);
  const checks: EmailChecks = {
    deliveryObserved: !receipt.label_ids.includes('DRAFT') && !sentOnly && (deliveredTo.includes(recipient) || receipt.label_ids.includes('INBOX') && to.includes(recipient)),
    recipientMatches: to.length === 1 && to[0] === recipient && !addresses(header('cc')).length && !addresses(header('bcc')).length,
    subjectMatches: header('subject') === expected.subject,
    bodyMatches: plainParts.length === 1 && body === approvedBody,
    noAttachments: leaves.every(part => ['text/plain', 'text/html'].includes(part.mime_type ?? '')) && parts.every(part => !part.filename && !part.body?.attachment_id && !(part.headers ?? []).some(entry => entry.name.toLowerCase() === 'content-disposition' && /attachment/i.test(entry.value))),
    plainTextOnly: leaves.length === 1 && leaves[0]?.mime_type === 'text/plain' && parts.every(part => part.mime_type === 'text/plain' || part.mime_type?.startsWith('multipart/')),
  };
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  return {
    gmailMessageId: receipt.id, rfcMessageId: header('message-id'), receivedAt: received.toISOString(),
    sender: header('from'), recipient: header('to'), subject: header('subject'), labels: receipt.label_ids,
    checks, approvedBodyPresent: body.startsWith(approvedBody), expectedBody: approvedBody, actualPlainTextBody: body,
    expectedBodySha256: hash(approvedBody), actualBodySha256: hash(body),
    additionalPlainText: body.startsWith(approvedBody) ? body.slice(approvedBody.length) : null,
    mimeTypes: parts.map(part => part.mime_type ?? 'unknown'), overallResult: getVerificationStatus(true, checks),
  };
}
