import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, CirclePause, Clock3, Copy, ExternalLink, Fingerprint, FlaskConical, Globe2, LoaderCircle, Mail, MessageSquare, Phone, RefreshCw, Search, ShieldCheck, ShieldQuestion, Terminal, TriangleAlert, X } from 'lucide-react';
import type { Readiness, Run, RunEvent, Worker } from '../src/shared/types';
import { request } from './api';
import { domain, duration, labels, money, safeUrl, time } from './format';

type ActionHandler = (operation: string, body?: unknown) => Promise<void>;

export function WorkerCanvas({ run, recording = false }: { run: Run; recording?: boolean }) {
  const activeWorkers = run.workers.length ? run.workers : Array.from({ length: 2 }, (_, index): Worker => ({ id: `pending-${index}`, title: `Browser worker ${String(index + 1).padStart(2, '0')}`, url: '', objective: 'Waiting for the plan.', status: 'queued', speculative: false, evidence: [] }));
  return <section className="worker-section"><div className="section-heading"><h2>Browser workspace <span className="section-count">{run.workers.length}</span></h2><span><span className="tiny-dot violet" />{run.strategy === 'parallel' ? 'Independent sessions' : 'One at a time'}</span></div><div className="worker-grid">{activeWorkers.map((worker, index) => <WorkerCard worker={worker} runId={run.id} key={worker.id} index={index} recording={recording} />)}</div></section>;
}

function WorkerCard({ worker, runId, index, recording }: { worker: Worker; runId: string; index: number; recording: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const screenshot = worker.screenshot?.startsWith('/api/') ? worker.screenshot : worker.screenshot ? `/api/runs/${runId}/workers/${encodeURIComponent(worker.id)}/screenshot` : null;
  useEffect(() => setImageFailed(false), [screenshot]);
  return <article className={`worker-card worker-${worker.status}`} data-testid="worker-card">
    <div className="worker-topline"><span className="worker-id"><Globe2 size={14} />BROWSER {String(index + 1).padStart(2, '0')}</span><span className={`worker-status status-${worker.status}`}>{worker.status === 'running' ? <LoaderCircle className="spin" size={12} /> : <span className="tiny-dot" />}{labels[worker.status]}</span></div>
    <div className="browser-preview"><div className="browser-chrome"><div className="traffic-lights"><i /><i /><i /></div><span><ShieldCheck size={10} />{worker.url ? domain(worker.url) : 'Waiting for a source'}</span><ExternalLink size={11} /></div><div className="preview-content">{screenshot && !imageFailed ? <a href={screenshot} target="_blank" rel="noreferrer" aria-label={`Open screenshot for ${worker.title}`}><img loading="lazy" src={screenshot} alt={`Captured browser view for ${worker.title}`} onError={() => setImageFailed(true)} /></a> : <div className="preview-empty">{worker.status === 'running' ? <div className="scanning-icon"><Search size={29} /></div> : worker.status === 'ready' ? <CheckCheck size={29} /> : worker.status === 'failed' ? <TriangleAlert size={29} /> : <Globe2 size={29} />}<span>{worker.status === 'running' ? 'Inspecting the source' : worker.status === 'ready' ? 'Browser research captured' : worker.status === 'failed' ? 'Worker encountered an issue' : 'Ready when the plan is'}</span><small>{recording ? 'Screenshot hidden for recording' : screenshot && imageFailed ? 'Screenshot unavailable' : 'Screenshots appear when captured'}</small></div>}</div></div>
    <div className="worker-details"><h3>{worker.title}</h3><p>{worker.objective}</p>{worker.speculative && <span className="speculation-label"><CirclePause size={12} /> Prepared as a backup</span>}{worker.error && <p className="worker-error">{worker.error}</p>}<div className="worker-footer"><span><Clock3 size={12} />{worker.elapsedMs === undefined ? 'Not measured yet' : duration(worker.elapsedMs)}</span><button className="text-button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{worker.evidence.length} observations<ChevronDown size={12} className={expanded ? 'rotated' : ''} /></button></div>{expanded && <div className="worker-observations">{worker.evidence.length ? worker.evidence.map(item => <div key={item.id}><span className="evidence-kind">{item.source === 'fixture' ? 'Fixture observation' : `${item.source} observation`}</span><strong>{item.title}</strong><p>{item.text}</p></div>) : <p>No observations recorded yet.</p>}</div>}</div>
  </article>;
}

export function ApprovalPanel({ run, connected, pending, onAction, onSetup, recording = false }: { run: Run; connected: boolean; pending: boolean; onAction: ActionHandler; onSetup: () => void; recording?: boolean }) {
  const action = run.action!;
  const [details, setDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const canApprove = !recording && action.status === 'pending' && (run.status === 'awaiting_approval' || run.status === 'awaiting_input');
  const needsConnection = run.mode === 'live' && !connected;
  return <section className={`approval-panel ${canApprove ? 'needs-approval' : ''}`} data-testid="approval-panel"><div className="approval-heading"><span className="approval-icon"><ShieldCheck size={19} /></span><div><h2>{canApprove ? 'Your move.' : action.status === 'outcome_unknown' ? 'Outcome unresolved' : 'Action record'}</h2><p>{canApprove ? 'Review the exact action before it happens.' : labels[action.status]}</p></div></div>
    <div className="approval-fields"><div><span>Action</span><strong>{action.operation === 'email' ? <Mail size={14} /> : action.operation === 'call' ? <Phone size={14} /> : <MessageSquare size={14} />}{action.operation === 'inquiry' ? 'Send inquiry' : action.operation === 'call' ? 'Place a call' : 'Send email'}</strong></div><div><span>Target</span><strong className="action-target" data-testid="approval-target">{action.target}</strong></div><div><span>Maximum spend</span><strong>{money(action.maxSpendCents)}</strong></div></div>
    <div className="message-preview"><span>{recording ? 'APPROVED PAYLOAD · HIDDEN FOR RECORDING' : 'EXACT MESSAGE'}</span><p data-testid="approval-message">{action.message}</p></div>
    <button className="approval-details-button" onClick={() => setDetails(value => !value)} aria-expanded={details}><Fingerprint size={14} />Bound to this payload<ChevronDown size={13} className={details ? 'rotated' : ''} /></button>
    {details && <div className="fingerprint-detail"><label>Approval fingerprint</label><code data-testid="approval-fingerprint">{action.fingerprint}</code><button className="text-button" onClick={() => { void navigator.clipboard?.writeText(action.fingerprint).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy fingerprint'}</button><p>Approval applies only to this target, message, operation, and spending limit. Any change requires a new approval.</p></div>}
    {action.status === 'outcome_unknown' && <p className="inline-warning"><TriangleAlert size={15} />External acceptance is unknown. Do not resubmit; reconcile the existing conversation.</p>}
    {canApprove && <><p className="approval-consent">{run.mode === 'sandbox' ? 'This approval starts a simulated Fo task. No real message or call is sent.' : 'Approving authorizes this exact live action through Fo. It may contact the target shown above.'}</p><div className="approval-buttons"><button className="secondary-button" disabled={pending} onClick={() => void onAction('reject')} data-testid="reject-action">Reject</button>{needsConnection ? <button className="primary-button" onClick={onSetup}>Connect Fo<ArrowRight size={14} /></button> : <button className="approve-button" disabled={pending} onClick={() => void onAction('approve', { fingerprint: action.fingerprint })} data-testid="approve-action">{pending ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}{run.mode === 'sandbox' ? 'Approve simulation' : 'Approve this action'}</button>}</div></>}
    {action.response && <div className="action-response"><span>Provider response</span><p>{action.response}</p></div>}
  </section>;
}

export function FoPanel({ run, pending, onAction }: { run: Run; pending: boolean; onAction: ActionHandler }) {
  const [answer, setAnswer] = useState('');
  const fo = run.fo;
  const fallbackProgress = fo.status === 'idle'
    ? 'Fo waits while browser workers gather the details. Every external action needs your approval.'
    : fo.status === 'complete'
      ? fo.simulated ? 'The simulated Fo protocol has finished. No external action occurred.' : 'Fo reported a final response. Independent destination verification is separate.'
      : fo.status === 'failed' ? 'Fo reported a failure. Inspect the response and recorded uncertainty.'
        : fo.status === 'awaiting_input' ? 'Review the provider question and prepare a reply for your approval.'
          : fo.status === 'outcome_unknown' ? 'External acceptance is unresolved. Reconcile the existing task before considering another action.'
            : 'Waiting for a provider update.';
  return <section className="fo-panel" data-testid="fo-panel"><div className="section-heading"><h2><span className="fo-glyph">fo</span> Real-world relay</h2><span className={`fo-mode ${fo.simulated ? 'simulated' : ''}`}>{fo.simulated ? <FlaskConical size={11} /> : <Globe2 size={11} />}{fo.simulated ? 'Simulated' : 'Live'}</span></div><div className={`fo-state fo-${fo.status}`}><span className="fo-state-symbol">{fo.status === 'working' ? <LoaderCircle size={21} className="spin" /> : fo.status === 'complete' ? <CheckCheck size={21} /> : fo.status === 'awaiting_input' ? <MessageSquare size={21} /> : fo.status === 'outcome_unknown' || fo.status === 'failed' ? <TriangleAlert size={21} /> : <CirclePause size={21} />}</span><strong>{labels[fo.status]}</strong><p data-testid="fo-progress">{fo.progress || fallbackProgress}</p>{fo.elapsedSeconds !== undefined && <span className="fo-elapsed"><Clock3 size={12} />{duration(fo.elapsedSeconds * 1000)} reported by Fo</span>}</div>{fo.response && <div className="fo-response"><label>{fo.simulated ? 'Simulated response' : 'Fo-reported response'}</label><p>{fo.response}</p><small><ShieldQuestion size={13} />Provider output; not independently verified.</small></div>}
    {fo.status === 'awaiting_input' && run.action?.status !== 'pending' && <form className="fo-answer" onSubmit={event => { event.preventDefault(); if (answer.trim()) void onAction('answer', { message: answer.trim() }); }}><label htmlFor="fo-answer">Fo needs your input</label><textarea id="fo-answer" data-testid="fo-answer" rows={3} value={answer} onChange={event => setAnswer(event.target.value)} required placeholder="Prepare a reply…" /><p>The reply will be prepared for your review. Nothing is sent until you approve its exact payload.</p><div><button className="secondary-button" disabled={pending || !answer.trim()} type="submit" data-testid="prepare-answer">Review reply<ArrowRight size={13} /></button></div></form>}
    {fo.status === 'outcome_unknown' && <p className="inline-warning">Local cancellation or disconnection does not cancel remote Fo work.</p>}
    {fo.conversationId && (run.status === 'interrupted' || fo.status === 'outcome_unknown') && <div className="fo-reconcile"><p>Check the existing conversation. This does not submit another task.</p><button className="secondary-button" disabled={pending} onClick={() => void onAction('poll')} data-testid="reconcile-fo"><RefreshCw size={13} />Refresh existing task</button></div>}
  </section>;
}

export function EvidencePanel({ run }: { run: Run }) {
  const evidence = run.workers.flatMap(worker => worker.evidence);
  return <section className="evidence-panel"><div className="section-heading"><h2>Evidence, with provenance</h2><span>{evidence.length} observations</span></div><p className="panel-description">Inspect what was actually observed. Model recommendations and provider reports remain distinct from independent verification.</p>{evidence.length ? <div className="evidence-list">{evidence.map(item => <article className="evidence-item" key={item.id}><div className="evidence-item-icon">{item.source === 'fixture' ? <FlaskConical size={19} /> : <Globe2 size={19} />}</div><div className="evidence-item-body"><div className="evidence-meta"><span>{item.source === 'fixture' ? 'Sandbox fixture' : item.source === 'fo' ? 'Provider reported' : item.source === 'model' ? 'Model recommendation' : `${item.source} observation`}</span><span>{time(item.capturedAt)}</span><span className={item.verified ? 'verified-label' : 'unverified-label'}>{item.verified ? <><Check size={12} />Verified observation</> : <><CircleHelp size={12} />Unverified</>}</span></div><h3>{item.title}</h3><p>{item.text}</p>{safeUrl(item.url) && <a href={safeUrl(item.url)} target="_blank" rel="noreferrer">{domain(item.url)}<ArrowUpRight size={13} /></a>}</div></article>)}</div> : <div className="panel-empty"><Search size={29} /><h3>No evidence yet</h3><p>Browser observations will appear here as workers inspect their sources.</p></div>}</section>;
}

export function Timeline({ events, compact = false }: { events: RunEvent[]; compact?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const visible = compact && !showAll ? events.slice(-6) : events;
  return <section className="timeline-panel"><div className="section-heading"><h2>Activity <span className="section-count">{events.length}</span></h2><span>Recorded events</span></div>{visible.length ? <ol className="timeline">{visible.map(event => <li key={event.id} data-testid="run-event"><time dateTime={event.at}>{time(event.at)}</time><span className={`timeline-dot ${/fail|error|unknown/.test(event.type) ? 'amber' : /complet|evidence|ready/.test(event.type) ? 'cyan' : 'violet'}`} /><div><p>{event.message}</p><span>{event.type.replaceAll('_', ' ')}{event.workerId ? ` · ${event.workerId}` : ''}</span>{event.detail !== undefined && <details><summary>Event details<ChevronRight size={12} /></summary><pre>{JSON.stringify(event.detail, null, 2)}</pre></details>}</div></li>)}</ol> : <div className="timeline-empty"><Clock3 size={17} />The run has not recorded any events yet.</div>}{compact && events.length > 6 && <button className="text-button timeline-more" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show recent events' : `Show all ${events.length} events`}<ChevronDown size={13} className={showAll ? 'rotated' : ''} /></button>}</section>;
}

export function SetupDrawer({ readiness, onClose, onRefresh }: { readiness: Readiness | null; onClose: () => void; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [authorizationUrl, setAuthorizationUrl] = useState<string | undefined>();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && panel.current) {
        const targets = [...panel.current.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [tabindex="0"]')].filter(element => !element.hasAttribute('disabled'));
        const first = targets[0]; const last = targets.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const connect = async (operation: 'discover' | 'connect') => {
    setBusy(true); setMessage('');
    try {
      const result = await request<{ message?: string; authorizationUrl?: string }>(`/api/fo/${operation}`, {});
      if (result.authorizationUrl) {
        const url = safeUrl(result.authorizationUrl);
        if (url) { setAuthorizationUrl(url); const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click(); }
      }
      setMessage(result.message || (result.authorizationUrl ? 'Complete Wajo sign-in in the opened tab, then check the connection.' : 'Connection checked.'));
      await onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Connection could not be checked.'); }
    finally { setBusy(false); }
  };
  return <div className="drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-drawer" role="dialog" aria-modal="true" aria-labelledby="setup-title" tabIndex={-1} ref={panel} data-testid="setup-drawer"><div className="drawer-heading"><div><span className="drawer-icon"><SettingsIcon /></span><h2 id="setup-title">Set the stage.</h2><p>Your connections, all in one place.</p></div><button className="icon-button" onClick={onClose} aria-label="Close connection settings"><X size={19} /></button></div><div className="setup-intro"><ShieldCheck size={17} /><p>Credentials stay on the server. Add them to your local environment, never to a goal or message.</p></div>
    <Connection title="Browser" subtitle="Independently owned local sessions" ready={Boolean(readiness?.browser.ready)} icon={<Globe2 size={18} />}><p>{readiness?.browser.message || 'Checking the local browser…'}</p></Connection>
    <Connection title="Anthropic" subtitle="Planning and browser intelligence" ready={Boolean(readiness?.anthropic.configured)} icon={<Terminal size={18} />}><p>{readiness?.anthropic.configured ? `Configured · ${readiness.anthropic.model}` : 'Set ANTHROPIC_API_KEY in the server environment, then restart the server.'}</p><small>{readiness?.anthropic.verified ? 'Provider connection verified.' : 'Configuration presence does not verify provider access.'}</small></Connection>
    <Connection title="Fo by Wajo" subtitle="Approved actions in the real world" ready={Boolean(readiness?.fo.connected)} icon={<MessageSquare size={18} />}><p>{readiness?.fo.message || 'Check your Wajo OAuth connection.'}</p><div className="setup-buttons"><button className="secondary-button compact" onClick={() => void connect('connect')} disabled={busy} data-testid="connect-fo">Connect Wajo<ExternalLink size={12} /></button><button className="text-button" onClick={() => void connect('discover')} disabled={busy}>Check connection<RefreshCw size={12} className={busy ? 'spin' : ''} /></button></div>{readiness?.fo.tools.length ? <small>{readiness.fo.tools.length} tools discovered · {readiness.fo.auth}</small> : null}</Connection>
    {message && <p className="setup-message" role="status">{message}</p>}{authorizationUrl && <a className="secondary-button refresh-readiness" href={authorizationUrl} target="_blank" rel="noopener noreferrer">Open Wajo sign-in<ExternalLink size={13} /></a>}<div className="setup-sandbox"><FlaskConical size={20} /><div><h3>Start in the sandbox</h3><p>Exercise the full review flow with real local browser fixtures and simulated model and Fo responses.</p></div></div><div className="setup-versions"><h3>Runtime</h3>{readiness && Object.entries(readiness.versions).map(([key, value]) => <div key={key}><span>{key}</span><code>{value}</code></div>)}</div><button className="secondary-button refresh-readiness" disabled={busy} onClick={() => void onRefresh()}><RefreshCw size={14} /> Refresh readiness</button></section></div>;
}

function Connection({ title, subtitle, ready, icon, children }: { title: string; subtitle: string; ready: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="connection"><div className="connection-heading"><span>{icon}</span><div><h3>{title}</h3><small>{subtitle}</small></div><span className={`connection-status ${ready ? 'ready' : ''}`}><span className="tiny-dot" />{ready ? 'Ready' : 'Setup needed'}</span></div><div className="connection-body">{children}</div></section>;
}
function SettingsIcon() { return <ShieldCheck size={25} strokeWidth={1.5} />; }
