import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const recipient = process.argv[2];
if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || recipient.length > 254) throw new Error('Supply the exact user-owned test email address. This script only prepares local JSON.');
const testId = `FOC-${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '')}-${randomUUID()}`;
const subject = `Fo-chestra authorized development test ${testId}`;
const body = `This is an authorized Fo-chestra development test.\nThis one-time, zero-spend email checks the Fo MCP integration and independent Gmail receipt verification.\nTest ID: ${testId}\nNo action or reply is required.`;
const message = `Send exactly one plain-text email to ${recipient}.\nUse this exact subject:\n${subject}\nUse this exact body, preserving its wording:\n${body}\nNo attachments, additional recipients, calls, purchases, bookings, follow-up emails or other external actions are authorized. Maximum authorized spend is $0. Do not purchase credits, start a paid service or incur any charge. If the email cannot be sent within these constraints, do not send it; report what blocks it. Return the actual conversation and delivery status. Never automatically resend.`;
const prepared = { testId, recipient, subject, body, bodySha256: createHash('sha256').update(body).digest('hex'), action: { target: recipient, operation: 'email', message, maxSpendCents: 0 },
  tool: 'ask_fo', integrationPath: 'Fo-chestra server → MCP SDK Streamable HTTP → https://mcp.api.wajo.ai/fo (standalone OAuth session)', approvalStatus: 'pending; no email has been sent',
  verification: { method: 'Independent read-only Gmail connector', query: `in:anywhere to:${recipient} subject:"${subject}"`, requirements: ['Read the matching message independently of Fo.', 'Check actual To, exact Subject, normalized plain-text body and absence of attachments.', 'Record immutable Gmail message ID and received timestamp as evidence.', 'If no matching receipt arrives, record outcome uncertain; never resubmit.'] } };
mkdirSync('.data/validation', { recursive: true });
writeFileSync('.data/validation/prepared-email.json', JSON.stringify(prepared, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ prepared: true, path: '.data/validation/prepared-email.json', testId, recipient, subject, body, tool: prepared.tool, integrationPath: prepared.integrationPath, approvalStatus: prepared.approvalStatus }, null, 2));
