import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FoClient, FoReply, PreparedAction } from '../shared/types.js';
import { ActionLedger, AuthorizationError } from '../security/action-ledger.js';
import { MemoryOAuthProvider, type FoAuthState } from './oauth.js';

export interface FoMcpSession {
  listTools(): Promise<{ tools: Array<{ name: string; inputSchema?: Record<string, unknown> }> }>;
  callTool(input: { name: string; arguments: Record<string, unknown> }, options?: { timeout: number; signal: AbortSignal }): Promise<unknown>;
  close(): Promise<void>;
}
export interface FoMcpOptions {
  ledger: ActionLedger; url?: string; redirectUrl?: string; accessToken?: string;
  enableLiveActions?: boolean; timeoutMs?: number;
  /** Dependency injection for contract tests; the default uses the actual MCP SDK transport. */
  sessionFactory?: () => Promise<FoMcpSession>;
}
export class FoProtocolError extends Error { constructor(message: string) { super(message); this.name = 'FoProtocolError'; } }
export class FoOutcomeUnknownError extends Error {
  constructor(readonly actionId: string) { super('Fo may have accepted this action. Reconcile its outcome before any further submission.'); this.name = 'FoOutcomeUnknownError'; }
}

/** Parses the documented Fo result without interpreting transcript instructions as authority. */
export function parseFoReply(result: unknown): FoReply {
  if (!result || typeof result !== 'object') throw new FoProtocolError('Fo returned an invalid tool result.');
  const envelope = result as Record<string, unknown>;
  if (envelope.isError === true) throw new FoProtocolError('Fo reported a tool error.');
  let data: unknown = envelope.structuredContent;
  if (!data && Array.isArray(envelope.content)) {
    const text = envelope.content.filter((part: unknown) => !!part && typeof part === 'object' && (part as { type?: string }).type === 'text').map((part: { text?: string }) => part.text ?? '').join('\n');
    try { data = JSON.parse(text); } catch { throw new FoProtocolError('Fo tool result did not contain the documented JSON receipt.'); }
  }
  if (!data && typeof envelope.status === 'string') data = envelope;
  if (!data || typeof data !== 'object') throw new FoProtocolError('Fo receipt is missing.');
  const receipt = data as Record<string, unknown>;
  if (!['working', 'complete', 'failed'].includes(String(receipt.status)) || typeof receipt.conversationId !== 'string' || !receipt.conversationId || receipt.conversationId.length > 500) {
    throw new FoProtocolError('Fo receipt has an invalid status or conversation identifier.');
  }
  for (const key of ['response', 'progress']) if (receipt[key] !== undefined && (typeof receipt[key] !== 'string' || String(receipt[key]).length > 100_000)) throw new FoProtocolError('Fo receipt text is invalid or too large.');
  if (receipt.elapsedSeconds !== undefined && (typeof receipt.elapsedSeconds !== 'number' || !Number.isFinite(receipt.elapsedSeconds) || receipt.elapsedSeconds < 0)) throw new FoProtocolError('Fo elapsed time is invalid.');
  return { status: receipt.status as FoReply['status'], conversationId: receipt.conversationId,
    ...(typeof receipt.response === 'string' ? { response: receipt.response } : {}),
    ...(typeof receipt.progress === 'string' ? { progress: receipt.progress } : {}),
    ...(typeof receipt.elapsedSeconds === 'number' ? { elapsedSeconds: receipt.elapsedSeconds } : {}) };
}
export function replyNeedsUserInput(reply: FoReply): boolean {
  return !!reply.response && /(?:waiting (?:for|on) (?:you|your)|need your (?:approval|confirmation|input)|please (?:confirm|provide|answer)|would you like|shall I|should I)/i.test(reply.response);
}
export function approvedFoMessage(action: PreparedAction): string {
  return `Requested operation: ${action.operation}\nExact target: ${action.target}\nMaximum authorized spend: $${(action.maxSpendCents / 100).toFixed(2)} USD\nInstructions and constraints:\n${action.message}\nDo not exceed this scope or spend limit; ask the user if any change is needed.`;
}

/** All write paths consume a durable exact-action authorization. Raw writes deliberately reject. */
export class FoMcpClient implements FoClient {
  private readonly ledger: ActionLedger;
  private readonly url: URL;
  private readonly oauth: MemoryOAuthProvider;
  private readonly enabled: boolean;
  private readonly timeoutMs: number;
  private readonly factory?: () => Promise<FoMcpSession>;
  private session?: FoMcpSession;
  private connecting?: Promise<FoMcpSession>;
  private discoveredTools: string[] = [];

  constructor(options: FoMcpOptions) {
    this.ledger = options.ledger;
    this.url = new URL(options.url ?? process.env.FO_MCP_URL ?? 'https://mcp.api.wajo.ai/fo');
    if (this.url.username || this.url.password || this.url.search || (this.url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(this.url.hostname))) throw new Error('Fo endpoint must be HTTPS or a loopback test endpoint, with no URL credentials.');
    this.oauth = new MemoryOAuthProvider(options.redirectUrl ?? process.env.FO_OAUTH_REDIRECT_URL ?? 'http://127.0.0.1:4318/api/fo/callback', options.accessToken ?? process.env.FO_ACCESS_TOKEN);
    this.enabled = options.enableLiveActions ?? process.env.FO_ENABLE_LIVE_ACTIONS === 'true';
    this.timeoutMs = options.timeoutMs ?? 60_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 120_000) throw new Error('Fo request timeout must be between 1 and 120000 ms.');
    this.factory = options.sessionFactory;
  }
  getAuthState(): FoAuthState { return this.oauth.getAuthState(); }
  getDiscoveryState(): { connected: boolean; tools: string[] } {
    return { connected: !!this.session && this.discoveredTools.length > 0, tools: [...this.discoveredTools] };
  }
  startOAuth(): Promise<{ authorizationUrl?: string; authenticated: boolean }> { return this.oauth.startOAuth(this.url); }
  async finishOAuth(code: string, state: string): Promise<FoAuthState> { await this.close(); return this.oauth.finishOAuth(this.url, code, state); }
  private async connect(): Promise<FoMcpSession> {
    if (this.session) return this.session;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      if (this.factory) return this.factory();
      const client = new Client({ name: 'fo-chestra', version: '0.1.0' });
      const transport = new StreamableHTTPClientTransport(this.url, { authProvider: this.oauth, reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 } });
      try { await client.connect(transport, { timeout: this.timeoutMs }); }
      catch { await transport.close().catch(() => undefined); throw new FoProtocolError('Fo connection failed or needs OAuth authorization.'); }
      return {
        listTools: () => client.listTools(),
        callTool: (input, options) => client.callTool(input, undefined, options),
        close: () => client.close(),
      } satisfies FoMcpSession;
    })();
    try { this.session = await this.connecting; return this.session; } finally { this.connecting = undefined; }
  }
  async discover(): Promise<{ connected: boolean; tools: string[]; message: string }> {
    try {
      const session = await this.connect();
      const { tools } = await session.listTools();
      const ask = tools.find(tool => tool.name === 'ask_fo');
      const reply = tools.find(tool => tool.name === 'get_fo_reply');
      if (!ask || !reply || !((ask.inputSchema?.properties as Record<string, unknown> | undefined)?.message)) throw new FoProtocolError('Fo tools do not match the documented text-loop contract.');
      this.discoveredTools = tools.map(tool => tool.name);
      return { connected: true, tools: this.discoveredTools, message: 'MCP initialized and text-loop tool schemas discovered. Live actions still require explicit exact-action approval.' };
    } catch {
      this.discoveredTools = [];
      return { connected: false, tools: [], message: 'Fo is unavailable, requires OAuth sign-in, or has an incompatible tool schema. No action was submitted.' };
    }
  }
  async submit(_message: string): Promise<FoReply> { throw new AuthorizationError('Use submitApproved with an action-specific ledger approval.'); }
  async answer(_conversationId: string, _message: string): Promise<FoReply> { throw new AuthorizationError('Use answerApproved with a newly reviewed answer.'); }
  private async call(name: string, args: Record<string, unknown>): Promise<FoReply> {
    const session = await this.connect();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new FoProtocolError('Fo request deadline elapsed.')); }, this.timeoutMs); });
    try { return parseFoReply(await Promise.race([session.callTool({ name, arguments: args }, { timeout: this.timeoutMs, signal: controller.signal }), deadline])); }
    finally { if (timer) clearTimeout(timer); }
  }
  private async readyForWrite(): Promise<void> {
    if (!this.enabled) throw new AuthorizationError('Live Fo actions are disabled. Set FO_ENABLE_LIVE_ACTIONS=true only after reviewing the action.');
    if (!this.discoveredTools.length && !(await this.discover()).connected) throw new FoProtocolError('Fo tool discovery or sign-in is required before submission.');
  }
  async submitApproved(id: string, runId: string, fingerprint: string): Promise<FoReply> {
    await this.readyForWrite();
    const claim = this.ledger.claim(id, runId, fingerprint);
    try {
      const reply = await this.call('ask_fo', { message: approvedFoMessage(claim.action), newConversation: true });
      this.ledger.recordReply(claim, reply); return reply;
    } catch { this.ledger.markUnknown(claim); throw new FoOutcomeUnknownError(id); }
  }
  async answerApproved(id: string, runId: string, fingerprint: string, conversationId: string): Promise<FoReply> {
    const current = this.ledger.findConversation(conversationId);
    if (!current || current.runId !== runId) throw new AuthorizationError('This conversation is not correlated with the run.');
    if (current.status === 'working' && !replyNeedsUserInput({ status: 'working', conversationId, response: current.response })) throw new AuthorizationError('Fo is still working; poll instead of starting another turn.');
    const proposed = this.ledger.get(id);
    if (proposed.target !== `conversation:${conversationId}` || proposed.runId !== runId) throw new AuthorizationError('Answer approval must bind to the exact server conversation.');
    await this.readyForWrite();
    const claim = this.ledger.claim(id, runId, fingerprint);
    try {
      const reply = await this.call('ask_fo', { message: approvedFoMessage(claim.action), conversationId });
      if (reply.conversationId !== conversationId) throw new FoProtocolError('Fo returned a different answer conversation.');
      this.ledger.recordReply(claim, reply); return reply;
    } catch { this.ledger.markUnknown(claim); throw new FoOutcomeUnknownError(id); }
  }
  async poll(conversationId: string, waitSeconds = 0): Promise<FoReply> {
    if (!this.ledger.findConversation(conversationId)) throw new AuthorizationError('Only a recorded server conversation can be polled.');
    if (!Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 40) throw new FoProtocolError('Fo waitSeconds must be an integer from 0 to 40.');
    const reply = await this.call('get_fo_reply', { conversationId, waitSeconds });
    if (reply.conversationId !== conversationId) throw new FoProtocolError('Fo returned a different conversation.');
    if (typeof reply.response !== 'string') throw new FoProtocolError('Fo polling receipt is missing its documented response field.');
    return reply;
  }
  async close(): Promise<void> { const session = this.session; this.session = undefined; this.discoveredTools = []; if (session) await session.close(); }
}
