import { AuthorizationError } from '../security/action-ledger.js';

/** Provider exceptions can contain request payloads. Only controlled local errors reach the UI. */
export function publicError(error: unknown): string {
  if (error instanceof AuthorizationError || error instanceof Error && ['BrowserPolicyError', 'FoProtocolError', 'FoOutcomeUnknownError'].includes(error.name)) return error.message.slice(0, 600);
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return 'Operation cancelled or its deadline elapsed.';
  if (error instanceof Error && /^(Run not found\.|Configure ANTHROPIC_API_KEY|Finish, reject or cancel|This run |No pending action|Fo has not requested|No recoverable conversation|This conversation has no outstanding|Workflow failed\.|Resumed workflow failed|Browser batch workflow failed|A prerequisite|Live planning requires ANTHROPIC_API_KEY|Live browser extraction requires ANTHROPIC_API_KEY|Planner attempted to leave)/.test(error.message)) return error.message.slice(0, 600);
  const status = error && typeof error === 'object' && 'statusCode' in error && Number.isInteger(error.statusCode) ? ` (HTTP ${Number(error.statusCode)})` : '';
  return `The operation failed${status}. Check configuration, model availability and connectivity; provider request bodies are withheld.`;
}
