import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FoReply, PreparedAction } from '../shared/types.js';

export interface ActionProposal {
  runId: string;
  target: string;
  operation: PreparedAction['operation'];
  message: string;
  maxSpendCents: number;
}
export interface DispatchClaim {
  readonly actionId: string;
  readonly runId: string;
  readonly fingerprint: string;
  readonly token: string;
  readonly action: PreparedAction;
}
export class AuthorizationError extends Error {
  constructor(message: string) { super(message); this.name = 'AuthorizationError'; }
}
interface StoredAction {
  id: string; run_id: string; payload: string; fingerprint: string;
  status: PreparedAction['status']; created_at: string; expires_at: string;
  dispatch_token: string | null; conversation_id: string | null; response: string | null;
}

/** Fingerprints the exact approved intent, including constraints expressed in the message. */
export function fingerprintAction(action: Pick<ActionProposal, 'target' | 'operation' | 'message' | 'maxSpendCents'>): string {
  return createHash('sha256').update(JSON.stringify({
    target: action.target, operation: action.operation,
    message: action.message, maxSpendCents: action.maxSpendCents,
  })).digest('hex');
}

/** Durable authority for dispatch. Provider completion is recorded, never promoted to verified evidence. */
export class ActionLedger {
  private readonly db: DatabaseSync;
  private readonly budgetCents: number;
  private readonly ttlMs: number;
  private readonly now: () => Date;

  constructor(dbPath: string, options: { budgetCents?: number; approvalTtlMs?: number; now?: () => Date } = {}) {
    this.budgetCents = options.budgetCents ?? 10_000;
    this.ttlMs = options.approvalTtlMs ?? 15 * 60_000;
    this.now = options.now ?? (() => new Date());
    if (!Number.isSafeInteger(this.budgetCents) || this.budgetCents < 0 || !Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw new AuthorizationError('Invalid action budget or approval lifetime.');
    }
    if (dbPath !== ':memory:') {
      const fullPath = resolve(dbPath);
      const scope = relative(resolve(process.cwd()), fullPath);
      if (scope.startsWith('..') || isAbsolute(scope)) throw new AuthorizationError('Action database must remain inside the workspace.');
      mkdirSync(dirname(fullPath), { recursive: true });
      dbPath = fullPath;
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS authorized_actions (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, payload TEXT NOT NULL,
      fingerprint TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL, dispatch_token TEXT, conversation_id TEXT,
      response TEXT, error TEXT
    ); CREATE INDEX IF NOT EXISTS authorized_actions_run ON authorized_actions(run_id);`);
    // A pre-submission intent left behind by a stopped process is never automatically replayed.
    this.db.prepare("UPDATE authorized_actions SET status = 'outcome_unknown', error = 'Dispatch interrupted; reconcile before any further submission.' WHERE status = 'dispatching'").run();
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private row(id: string): StoredAction {
    const row = this.db.prepare('SELECT * FROM authorized_actions WHERE id = ?').get(id) as unknown as StoredAction | undefined;
    if (!row) throw new AuthorizationError('Unknown prepared action.');
    return row;
  }
  private read(row: StoredAction): PreparedAction {
    const payload = JSON.parse(row.payload) as ActionProposal;
    if (fingerprintAction(payload) !== row.fingerprint || payload.runId !== row.run_id) {
      throw new AuthorizationError('Prepared action integrity check failed.');
    }
    return {
      ...payload, id: row.id, fingerprint: row.fingerprint, status: row.status,
      createdAt: row.created_at,
      ...(row.conversation_id ? { conversationId: row.conversation_id } : {}),
      ...(row.response ? { response: row.response } : {}),
    };
  }
  private scoped(id: string, runId: string, fingerprint?: string): StoredAction {
    const row = this.row(id);
    this.read(row);
    if (row.run_id !== runId || (fingerprint !== undefined && row.fingerprint !== fingerprint)) {
      throw new AuthorizationError('Approval does not match this run and exact action.');
    }
    return row;
  }
  private unexpired(row: StoredAction): void {
    if (this.now().getTime() >= Date.parse(row.expires_at)) throw new AuthorizationError('Approval expired; prepare and review a new action.');
  }

  propose(input: ActionProposal): PreparedAction {
    if (!input || typeof input.runId !== 'string' || !input.runId.trim() || input.runId.length > 200 ||
        typeof input.target !== 'string' || !input.target.trim() || input.target.length > 500 ||
        typeof input.message !== 'string' || !input.message.trim() || input.message.length > 16_000 ||
        !['email', 'call', 'inquiry'].includes(input.operation) ||
        !Number.isSafeInteger(input.maxSpendCents) || input.maxSpendCents < 0 || input.maxSpendCents > this.budgetCents) {
      throw new AuthorizationError('Invalid prepared action or spend limit.');
    }
    const payload: ActionProposal = { runId: input.runId, target: input.target, operation: input.operation, message: input.message, maxSpendCents: input.maxSpendCents };
    const id = randomUUID();
    const created = this.now();
    this.db.prepare(`INSERT INTO authorized_actions (id,run_id,payload,fingerprint,status,created_at,expires_at)
      VALUES (?,?,?,?,?,?,?)`).run(id, input.runId, JSON.stringify(payload), fingerprintAction(payload), 'pending', created.toISOString(), new Date(created.getTime() + this.ttlMs).toISOString());
    return this.get(id);
  }
  get(id: string): PreparedAction { return this.read(this.row(id)); }
  listForRun(runId: string): PreparedAction[] {
    return (this.db.prepare('SELECT * FROM authorized_actions WHERE run_id = ? ORDER BY created_at,id').all(runId) as unknown as StoredAction[]).map(row => this.read(row));
  }
  findConversation(conversationId: string): PreparedAction | undefined {
    const row = this.db.prepare('SELECT * FROM authorized_actions WHERE conversation_id = ? ORDER BY rowid DESC LIMIT 1').get(conversationId) as unknown as StoredAction | undefined;
    return row ? this.read(row) : undefined;
  }
  approve(id: string, runId: string, fingerprint: string): PreparedAction {
    return this.transaction(() => {
      const row = this.scoped(id, runId, fingerprint); this.unexpired(row);
      if (row.status !== 'pending') throw new AuthorizationError('Only a pending action can be approved.');
      this.db.prepare("UPDATE authorized_actions SET status = 'approved' WHERE id = ?").run(id);
      return this.get(id);
    });
  }
  reject(id: string, runId: string, fingerprint: string): PreparedAction {
    return this.transaction(() => {
      const row = this.scoped(id, runId, fingerprint);
      if (!['pending', 'approved'].includes(row.status)) throw new AuthorizationError('A dispatched action cannot be rejected locally.');
      this.db.prepare("UPDATE authorized_actions SET status = 'rejected' WHERE id = ?").run(id);
      return this.get(id);
    });
  }
  reservedCents(runId: string): number {
    const rows = this.listForRun(runId);
    return rows.filter(row => ['dispatching', 'working', 'complete', 'failed', 'outcome_unknown'].includes(row.status)).reduce((total, row) => total + row.maxSpendCents, 0);
  }
  reservedTotalCents(): number {
    const rows = this.db.prepare("SELECT * FROM authorized_actions WHERE status IN ('dispatching','working','complete','failed','outcome_unknown') AND dispatch_token IS NOT NULL").all() as unknown as StoredAction[];
    return rows.reduce((total, row) => total + this.read(row).maxSpendCents, 0);
  }
  claim(id: string, runId: string, fingerprint: string): DispatchClaim {
    return this.transaction(() => {
      const row = this.scoped(id, runId, fingerprint); this.unexpired(row);
      if (row.status !== 'approved') throw new AuthorizationError('Action is not approved, has already been dispatched, or requires reconciliation.');
      const action = this.read(row);
      const duplicate = this.db.prepare(`SELECT id FROM authorized_actions WHERE fingerprint = ? AND id <> ? AND
        ((run_id = ? AND status IN ('dispatching','working','complete','outcome_unknown')) OR status IN ('dispatching','working','outcome_unknown')) LIMIT 1`).get(fingerprint, id, runId);
      if (duplicate) throw new AuthorizationError('An identical action is already dispatched or has an unresolved outcome. Reconcile it instead of submitting again.');
      if (this.reservedTotalCents() + action.maxSpendCents > this.budgetCents) throw new AuthorizationError('Pending and completed actions exceed the ledger spend cap.');
      if (action.target.startsWith('conversation:') && this.listForRun(runId).some(other => other.id !== id && other.target === action.target && ['dispatching', 'working', 'outcome_unknown'].includes(other.status))) {
        throw new AuthorizationError('Another answer for this conversation is pending or requires reconciliation.');
      }
      const token = randomUUID();
      this.db.prepare("UPDATE authorized_actions SET status = 'dispatching', dispatch_token = ? WHERE id = ? AND status = 'approved'").run(token, id);
      return { actionId: id, runId, fingerprint, token, action: this.get(id) };
    });
  }
  private claimed(claim: DispatchClaim): StoredAction {
    const row = this.scoped(claim.actionId, claim.runId, claim.fingerprint);
    if (row.dispatch_token !== claim.token || !['dispatching', 'outcome_unknown'].includes(row.status)) throw new AuthorizationError('Invalid or consumed dispatch authorization.');
    return row;
  }
  recordReply(claim: DispatchClaim, reply: FoReply): PreparedAction {
    return this.transaction(() => {
      this.claimed(claim);
      this.saveReply(claim.actionId, reply);
      return this.get(claim.actionId);
    });
  }
  private saveReply(id: string, reply: FoReply): void {
    if (!reply.conversationId || !['working', 'complete', 'failed'].includes(reply.status)) throw new AuthorizationError('Invalid Fo receipt.');
    this.db.prepare('UPDATE authorized_actions SET status = ?, conversation_id = ?, response = ? WHERE id = ?').run(reply.status, reply.conversationId, reply.response ?? reply.progress ?? null, id);
  }
  recordPoll(id: string, runId: string, reply: FoReply): PreparedAction {
    return this.transaction(() => {
      const row = this.scoped(id, runId);
      if (!['working', 'outcome_unknown'].includes(row.status) || !row.conversation_id || row.conversation_id !== reply.conversationId) {
        throw new AuthorizationError('Reply does not belong to an outstanding action.');
      }
      this.saveReply(id, reply); return this.get(id);
    });
  }
  markUnknown(claim: DispatchClaim, _reason = 'External submission outcome is unknown.'): PreparedAction {
    return this.transaction(() => {
      this.claimed(claim);
      // Do not persist exception bodies, headers, tokens, or arbitrary provider diagnostics.
      this.db.prepare("UPDATE authorized_actions SET status = 'outcome_unknown', error = 'Submission outcome unknown; reconcile before retry.' WHERE id = ?").run(claim.actionId);
      return this.get(claim.actionId);
    });
  }
  close(): void { this.db.close(); }
}
