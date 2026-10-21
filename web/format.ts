import type { RunStatus } from '../src/shared/types';

export const terminal = new Set<RunStatus>(['completed', 'partial', 'failed', 'cancelled', 'interrupted']);
export const labels: Record<string, string> = {
  planning: 'Planning', researching: 'Researching', awaiting_approval: 'Your approval needed', working: 'In progress', awaiting_input: 'Your input needed',
  completed: 'Run complete', partial: 'Partial result', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted',
  queued: 'Queued', running: 'Working', ready: 'Research complete', pending: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected',
  dispatching: 'Submitting', complete: 'Provider complete', outcome_unknown: 'Outcome unknown', idle: 'Not dispatched',
};
export function duration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}
export function time(at: string) { return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
export function date(at: string) { return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' }); }
export function domain(url: string) { try { return new URL(url).hostname; } catch { return url; } }
export function safeUrl(url: string) { try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : undefined; } catch { return undefined; } }
export function money(cents: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100); }
