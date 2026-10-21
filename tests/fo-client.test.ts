import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionLedger } from '../src/security/action-ledger.js';
import { FoMcpClient, FoOutcomeUnknownError, parseFoReply, type FoMcpSession } from '../src/fo/client.js';
import { MockFoClient } from '../src/fo/mock-client.js';
import { MemoryOAuthProvider } from '../src/fo/oauth.js';

const opened: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => { for (const item of opened.splice(0).reverse()) await item.close(); });
function setup(call = vi.fn(async (_input: unknown) => ({ structuredContent: { status: 'working', conversationId: 'real-server-id', progress: 'Working.' } })), enabled = true, timeoutMs = 100) {
  const ledger = new ActionLedger(':memory:'); opened.push(ledger);
  const session: FoMcpSession = {
    listTools: vi.fn(async () => ({ tools: [{ name: 'ask_fo', inputSchema: { type: 'object', properties: { message: { type: 'string' } } } }, { name: 'get_fo_reply' }] })),
    callTool: call, close: vi.fn(async () => undefined),
  };
  const client = new FoMcpClient({ ledger, sessionFactory: async () => session, enableLiveActions: enabled, timeoutMs }); opened.push(client);
  const action = ledger.propose({ runId: 'run', target: 'myself@example.test', operation: 'email', message: 'Send the exact inquiry to me only.', maxSpendCents: 0 });
  ledger.approve(action.id, action.runId, action.fingerprint);
  return { ledger, client, session, action, call };
}

describe('Fo protocol and authorized boundary', () => {
  it('discovers schemas and sends only the documented initial arguments after approval', async () => {
    const { client, call, action, ledger, session } = setup();
    expect(client.getDiscoveryState()).toEqual({ connected: false, tools: [] });
    expect((await client.discover()).connected).toBe(true);
    expect(client.getDiscoveryState()).toEqual({ connected: true, tools: ['ask_fo', 'get_fo_reply'] });
    expect(call).not.toHaveBeenCalled();
    await client.submitApproved(action.id, action.runId, action.fingerprint);
    expect(call).toHaveBeenCalledTimes(1);
    const payload = call.mock.calls[0]![0] as unknown as { name: string; arguments: Record<string, unknown> };
    expect(payload.name).toBe('ask_fo'); expect(payload.arguments.newConversation).toBe(true);
    expect(Object.keys(payload.arguments).sort()).toEqual(['message', 'newConversation']);
    expect(payload.arguments.message).toContain(action.target);
    expect(ledger.get(action.id).conversationId).toBe('real-server-id');
    await expect(client.submitApproved(action.id, action.runId, action.fingerprint)).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
    vi.mocked(session.listTools).mockRejectedValueOnce(new Error('Simulated discovery failure.'));
    expect((await client.discover()).connected).toBe(false);
    expect(client.getDiscoveryState()).toEqual({ connected: false, tools: [] });
  });
  it('disables live actions by default and rejects raw submission paths', async () => {
    const { client, call, action } = setup(undefined, false);
    await expect(client.submitApproved(action.id, action.runId, action.fingerprint)).rejects.toThrow(/disabled/);
    await expect(client.submit('bypass')).rejects.toThrow(/submitApproved/);
    await expect(client.answer('server-id', 'bypass')).rejects.toThrow(/answerApproved/);
    expect(call).not.toHaveBeenCalled();
  });
  it('persists an unknown outcome on timeout and never retries the accepted request', async () => {
    const hanging = vi.fn(() => new Promise<unknown>(() => undefined));
    const { client, ledger, action } = setup(hanging as never, true, 5);
    await expect(client.submitApproved(action.id, action.runId, action.fingerprint)).rejects.toBeInstanceOf(FoOutcomeUnknownError);
    expect(ledger.get(action.id).status).toBe('outcome_unknown');
    await expect(client.submitApproved(action.id, action.runId, action.fingerprint)).rejects.toThrow();
    expect(hanging).toHaveBeenCalledTimes(1);
  });
  it('does not report isError or malformed tool results as completion', async () => {
    expect(() => parseFoReply({ isError: true, content: [{ type: 'text', text: 'Failed' }] })).toThrow(/tool error/);
    expect(() => parseFoReply({ structuredContent: { status: 'complete' } })).toThrow();
    expect(parseFoReply({ content: [{ type: 'text', text: JSON.stringify({ status: 'failed', conversationId: 'server-2', response: 'Failure.' }) }] }).status).toBe('failed');
  });
  it('enforces server conversation correlation for polling and reviewed answers', async () => {
    const { client, action, ledger, call } = setup();
    await client.submitApproved(action.id, action.runId, action.fingerprint);
    await expect(client.poll('made-up')).rejects.toThrow(/recorded/);
    await expect(client.poll('real-server-id', 41)).rejects.toThrow(/40/);
    const answer = ledger.propose({ runId: 'run', target: 'conversation:real-server-id', operation: 'inquiry', message: 'Yes, but only to myself.', maxSpendCents: 0 });
    ledger.approve(answer.id, answer.runId, answer.fingerprint);
    await expect(client.answerApproved(answer.id, answer.runId, answer.fingerprint, 'real-server-id')).rejects.toThrow(/still working/);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('rejects an incomplete polling receipt without declaring the remote task complete', async () => {
    const { client, action, ledger } = setup();
    await client.submitApproved(action.id, action.runId, action.fingerprint);
    await expect(client.poll('real-server-id')).rejects.toThrow(/response field/);
    expect(ledger.get(action.id).status).toBe('working');
  });
  it('validates OAuth callback state without exposing or writing tokens', async () => {
    const provider = new MemoryOAuthProvider('http://127.0.0.1:4318/api/fo/callback');
    expect(provider.getAuthState().authenticated).toBe(false);
    await expect(provider.finishOAuth(new URL('https://mcp.api.wajo.ai/fo'), 'code', 'forged')).rejects.toThrow(/state/);
    const secret = new MemoryOAuthProvider('http://127.0.0.1:4318/api/fo/callback', 'private-token');
    expect(JSON.stringify(secret.getAuthState())).not.toContain('private-token');
    expect(() => new MemoryOAuthProvider('https://attacker.example/callback')).toThrow(/loopback/);
  });
  it('simulates delayed progress, questions, answers and provider failure without network', async () => {
    const question = new MockFoClient({ delayMs: 0, scenario: 'question' }); opened.push(question);
    const initial = await question.submit('Simulate an inquiry.');
    const progress = await question.poll(initial.conversationId);
    expect(progress.status).toBe('working'); expect(progress.response).toBe('');
    expect((await question.poll(initial.conversationId)).response).toContain('Please confirm');
    await question.answer(initial.conversationId, 'Approved simulated answer.');
    await question.poll(initial.conversationId);
    expect((await question.poll(initial.conversationId)).response).toContain('no external action');
    const failure = new MockFoClient({ delayMs: 0, scenario: 'failure' }); opened.push(failure);
    const failed = await failure.submit('Simulated failure.'); await failure.poll(failed.conversationId);
    expect((await failure.poll(failed.conversationId)).status).toBe('failed');
  });
});
