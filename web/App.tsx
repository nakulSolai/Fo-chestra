import { useEffect, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, AudioLines, ChevronDown, ChevronRight, CircleHelp, Command, FlaskConical, Globe2, History, Layers3, LoaderCircle, Plus, Settings2, ShieldCheck, Square, Terminal, TriangleAlert, X } from 'lucide-react';
import type { RunMode, Strategy } from '../src/shared/types';
import { request, useOrchestra } from './api';
import { date, duration, labels, terminal } from './format';
import { ApprovalPanel, EvidencePanel, FoPanel, SetupDrawer, Timeline, WorkerCanvas } from './panels';
import { VerificationPanel } from './verification';
import { DecisionPanel } from './decision';
import { recordingRun } from './recording';
import { RecordingBenchmark, RecordingToolbar } from './recording-panel';

const fallbackExamples = [
  { id: 'comparison' as const, title: 'Compare local options', subtitle: 'Research in parallel. Prepare one inquiry.', goal: 'Compare local suppliers for a team event. Find availability, pricing, and constraints, then prepare an inquiry to the best match.' },
  { id: 'appointments' as const, title: 'Find an appointment', subtitle: 'Check options. Prepare a booking request.', goal: 'Find an appointment that fits my schedule. Compare available providers and prepare a request to confirm the best option.' },
];

export function App() {
  const orchestra = useOrchestra();
  const { readiness, runs: rawRuns, run: rawRun, pending, error } = orchestra;
  const recording = new URLSearchParams(window.location.search).get('record') === '1';
  const runs = recording ? rawRuns.map(recordingRun) : rawRuns;
  const run = recording && rawRun ? recordingRun(rawRun) : rawRun;
  const savedLiveRun = rawRuns.find(item => item.mode === 'live' && item.fo.simulated === false && item.verification?.method === 'operator_gmail_receipt');
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [mode, setMode] = useState<RunMode>('sandbox');
  const [strategy, setStrategy] = useState<Strategy>('parallel');
  const [goal, setGoal] = useState('');
  const [urls, setUrls] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [prepareAction, setPrepareAction] = useState(true);
  const [scenario, setScenario] = useState<'comparison' | 'appointments' | undefined>();
  const [examples, setExamples] = useState(fallbackExamples);
  const [tab, setTab] = useState<'overview' | 'evidence' | 'trace'>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    let disposed = false;
    void request<Array<{ id: 'comparison' | 'appointments'; title: string; goal: string }>>('/api/scenarios').then(items => {
      const supported = items.filter(item => item.id === 'comparison' || item.id === 'appointments');
      if (!disposed && supported.length) setExamples(supported.map(item => ({ ...item, subtitle: fallbackExamples.find(example => example.id === item.id)?.subtitle ?? 'Try this goal in the shared workspace.' })));
    }).catch(() => { /* Inline examples remain available when discovery fails. */ });
    return () => { disposed = true; };
  }, []);
  useEffect(() => { setTab('overview'); }, [run?.id]);

  const newRun = () => { orchestra.select(null); setGoal(''); setScenario(undefined); setSidebarOpen(false); setShowBenchmark(false); };
  const elapsed = run ? (terminal.has(run.status) ? run.metrics.elapsedMs : Math.max(run.metrics.elapsedMs, now - new Date(run.createdAt).getTime())) : 0;
  const evidence = run?.workers.flatMap(worker => worker.evidence) ?? [];
  const liveBlocked = mode === 'live' && (!readiness?.browser.ready || !readiness.anthropic.configured);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || !goal.trim()) return;
    if (liveBlocked) { setSetupOpen(true); return; }
    void orchestra.create({ goal: goal.trim(), mode, strategy, urls: urls.split(/[\n,]+/).map(url => url.trim()).filter(Boolean), scenario, prepareAction, maxWorkers: 2 });
  };

  return <div className={`app-shell ${recording ? 'recording-mode' : ''}`}>
    <a className="skip-link" href="#main-content">Skip to workspace</a>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
      <a className="brand" href="#" onClick={event => { event.preventDefault(); newRun(); }} aria-label="Fo-chestra home"><span className="brand-mark"><AudioLines size={25} strokeWidth={1.8} /></span><span>fo-chestra<span className="brand-period">.</span></span></a>
      <button className="new-run-button" onClick={newRun} data-testid="new-run"><Plus size={16} /> New orchestration <span className="key-hint"><Command size={10} /></span></button>
      <div className="nav-section-label">WORKSPACE</div>
      <button className="nav-item selected" onClick={() => setSidebarOpen(false)}><Layers3 size={17} /> Orchestrations <span className="nav-count">{runs.length}</span></button>
      <button className="nav-item" onClick={() => setSetupOpen(true)} data-testid="open-setup"><Settings2 size={17} /> Connections <span className={`tiny-dot ${readiness?.fo.connected && readiness?.anthropic.configured ? 'cyan' : 'amber'}`} /></button>
      <div className="history-heading"><span className="nav-section-label">RECENT RUNS</span><History size={13} /></div>
      <div className="run-history">
        {runs.length ? runs.map(item => <button key={item.id} className={`history-item ${run?.id === item.id ? 'active' : ''}`} onClick={() => { orchestra.select(item.id); setSidebarOpen(false); setShowBenchmark(false); }} data-testid="history-run" data-run-id={item.id}>
          <span className={`tiny-dot status-${item.status}`} /><span className="history-copy"><span>{item.goal}</span><small>{date(item.createdAt)} · {item.mode === 'sandbox' ? 'Sandbox' : 'Live'}</small></span>
        </button>) : <p className="history-empty">Your work starts here.<br />Runs and their evidence stay together.</p>}
      </div>
      <div className="sidebar-bottom">
        <div className="local-note"><span className="tiny-dot cyan" /><span>Local workspace</span><span className="local-port">127.0.0.1</span></div>
        <button className="profile-row" onClick={() => setSetupOpen(true)}><span className="profile-avatar"><Terminal size={17} /></span><span><strong>Your control room</strong><small>Human in the loop</small></span><ChevronRight size={15} /></button>
      </div>
    </aside>

    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumb"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Layers3 size={19} /></button><span>Workspace</span><ChevronRight size={13} /><strong>{run ? 'Run details' : 'New orchestration'}</strong></div>
        <div className="topbar-actions"><span className="human-control"><ShieldCheck size={14} /> You stay in control</span><button className="icon-button" aria-label="Connection settings" onClick={() => setSetupOpen(true)}><Settings2 size={18} /></button></div>
      </header>

      <main id="main-content">
        {error && <div className="error-banner" role="alert" data-testid="error-banner"><TriangleAlert size={17} /><span>{error}</span><button aria-label="Dismiss error" onClick={orchestra.clearError}><X size={16} /></button></div>}

        {recording && <RecordingToolbar hasLive={Boolean(savedLiveRun)} onLive={() => { if (savedLiveRun) { setShowBenchmark(false); orchestra.select(savedLiveRun.id); } }} onBenchmark={() => { setShowBenchmark(true); window.scrollTo(0, 0); }} />}
        {showBenchmark ? <RecordingBenchmark /> : !run ? <>
          <section className="welcome-heading"><h1>A goal. A coordinated <em>effort.</em></h1><p>Browser research and real-world action, working in concert.</p></section>
          <form className="composer" onSubmit={submit}>
            <div className="composer-header"><label htmlFor="goal">What would you like to get done?</label><div className="mode-switch" aria-label="Execution mode"><button type="button" className={mode === 'sandbox' ? 'active' : ''} aria-pressed={mode === 'sandbox'} onClick={() => setMode('sandbox')}><FlaskConical size={13} /> Sandbox</button><button type="button" disabled={recording} className={mode === 'live' ? 'active live' : ''} aria-pressed={mode === 'live'} onClick={() => setMode('live')}><Globe2 size={13} /> Live</button></div></div>
            <textarea id="goal" data-testid="goal-input" value={goal} onChange={event => { setGoal(event.target.value); setScenario(undefined); }} placeholder="Describe your goal, what matters, and any constraints…" maxLength={12000} required rows={4} />
            <div className="composer-options"><button className="text-button" type="button" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}><Plus size={14} /> Add sources & options <ChevronDown size={13} className={advanced ? 'rotated' : ''} /></button><span className="worker-count"><span className="double-dot"><i /><i /></span> Two browser workers</span></div>
            {advanced && <div className="advanced-options"><label htmlFor="urls">Starting URLs <span>optional · one per line</span></label><textarea id="urls" value={urls} onChange={event => setUrls(event.target.value)} placeholder="https://…" rows={2} /><label className="checkbox-label"><input type="checkbox" checked={prepareAction} onChange={event => setPrepareAction(event.target.checked)} /> Prepare a Fo action for my review</label></div>}
            <div className="composer-footer"><div className="strategy-select"><label htmlFor="strategy">Execution</label><select id="strategy" data-testid="strategy-select" value={strategy} onChange={event => setStrategy(event.target.value as Strategy)}><option value="parallel">Parallel</option><option value="sequential">Sequential</option></select><ChevronDown size={13} /></div><button className="primary-button" type="submit" disabled={!goal.trim() || pending} data-testid="start-run">{pending ? <LoaderCircle className="spin" size={16} /> : null}{liveBlocked ? 'Review live setup' : 'Start orchestration'}<ArrowRight size={17} /></button></div>
          </form>
          <div className={`mode-disclosure ${mode}`} role="note"><FlaskConical size={15} /><p>{mode === 'sandbox' ? <><strong>A safe place to try it.</strong> Real browser fixtures; simulated planning and Fo. Nothing is sent to the outside world.</> : <><strong>Live providers, explicit approval.</strong> Claude researches real sources. Review the exact action before Fo contacts anyone.</>}</p></div>
          <section className="examples-section"><div className="section-heading"><h2>A little inspiration</h2><span>Examples, not limits</span></div><div className="example-row">{examples.map(example => <button className="example-card" type="button" key={example.id} onClick={() => { setGoal(example.goal); setScenario(example.id); document.getElementById('goal')?.focus(); }} data-testid={`example-${example.id}`}><span className="example-symbol">{example.id === 'comparison' ? <Layers3 size={21} /> : <Globe2 size={21} />}</span><span><strong>{example.title}</strong><small>{example.subtitle}</small></span><ArrowRight size={17} /></button>)}</div></section>
          <section className="empty-workspace"><div className="empty-canvas"><div className="empty-node"><Globe2 size={20} /><span>Browser 01</span><span className="waiting-dot" /></div><div className="orchestration-line"><span /><AudioLines size={27} /><span /></div><div className="empty-node"><Globe2 size={20} /><span>Browser 02</span><span className="waiting-dot" /></div></div><h2>Independent workers. One shared goal.</h2><p>Watch research unfold, inspect the evidence,<br />and approve the action when you're ready.</p><div className="empty-caption"><ShieldCheck size={13} /> Every consequential action waits for you.</div></section>
        </> : <>
          {recording && run.mode === 'live' && <div className="recording-historical" data-testid="recording-historical"><strong>PRIOR REAL EXECUTION · NOT SENT DURING THIS RECORDING</strong>Private text is hidden. The original provider result and independent receipt checks are preserved. Opening this saved result does not send another action.</div>}
          <section className="run-heading"><div><div className="run-heading-meta"><span className={`mode-tag ${run.mode}`}><span className="tiny-dot" />{run.mode === 'sandbox' ? 'Sandbox run' : recording ? 'Saved live run' : 'Live run'}</span><span>{run.strategy === 'parallel' ? 'Parallel orchestration' : 'Sequential baseline'}</span><span className="meta-separator">/</span><span>{date(run.createdAt)}</span></div><h1 data-testid="run-goal">{run.goal}</h1></div><div className="run-heading-actions"><span className={`status-pill status-${run.status}`} data-testid="run-status"><span className="tiny-dot" />{labels[run.status]}</span><div>{!terminal.has(run.status) && <button className="secondary-button compact" onClick={() => void orchestra.action('cancel')} disabled={pending} data-testid="cancel-run"><Square size={12} /> Stop run</button>}<a className="icon-button export-button" href={`/api/runs/${run.id}/export`} target="_blank" rel="noreferrer" aria-label="Export redacted run trace" title="Export redacted run trace"><ArrowDownToLine size={16} /></a></div></div></section>
          {run.mode === 'sandbox' && <div className="sandbox-ribbon"><FlaskConical size={14} /><span>Sandbox · Real browser fixtures. Simulated planning and Fo. No external action.</span></div>}
          <div className="metrics-strip"><Metric label="Elapsed time" value={duration(elapsed)} icon={<Activity size={15} />} /><Metric label="Browser work" value={duration(run.metrics.browserActiveMs)} /><Metric label="Work overlapped" value={duration(run.metrics.overlapMs)} accent /><Metric label="Peak workers" value={String(run.metrics.maxConcurrentWorkers)} /><Metric label="Model usage" value={run.usage.length ? `${run.usage.reduce((sum, usage) => sum + usage.inputTokens + usage.outputTokens, 0).toLocaleString()} tokens` : run.mode === 'sandbox' ? 'Simulated' : 'No requests yet'} /></div>
          <div className="run-tabs" role="tablist" aria-label="Run views">{(['overview', 'evidence', 'trace'] as const).map(item => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)} id={`tab-${item}`} aria-controls={`panel-${item}`}><span>{item === 'overview' ? 'Workspace' : item === 'evidence' ? 'Evidence' : 'Run trace'}</span>{item === 'evidence' && <span className="tab-count">{evidence.length}</span>}{item === 'trace' && <span className="tab-count">{run.events.length}</span>}</button>)}<span className="stream-status"><span className={`tiny-dot ${orchestra.connected ? 'cyan' : ''}`} />{orchestra.connected ? 'Connected' : 'Polling updates'}</span></div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'overview' && <DecisionPanel run={run} onEvidence={() => setTab('evidence')} />}
            {tab === 'overview' && <><div className="workspace-grid"><div className="research-column"><WorkerCanvas run={run} recording={recording && run.mode === 'live'} />{run.plan && <div className="plan-note"><AudioLines size={17} /><div><h3>The approach</h3><p>{run.plan.summary}</p></div></div>}</div><div className="action-column">{run.action && <ApprovalPanel recording={recording && run.mode === 'live'} run={run} connected={Boolean(readiness?.fo.connected)} pending={pending} onAction={orchestra.action} onSetup={() => setSetupOpen(true)} />}<FoPanel run={run} pending={pending} onAction={orchestra.action} /></div></div>{(run.summary || run.error || run.uncertainties.length > 0) && <section className="result-panel"><div className="section-heading"><h2>{terminal.has(run.status) ? 'What we know' : 'Findings so far'}</h2><ShieldCheck size={16} /></div>{run.summary && <p className="result-summary" data-testid="run-summary">{run.summary}</p>}{run.error && <p className="result-error">{run.error}</p>}{run.uncertainties.length > 0 && <div className="uncertainties"><h3><CircleHelp size={15} /> Notes from this run</h3><p className="uncertainty-context">Notes reflect earlier stages of this run. The current result is shown above.</p><ul>{run.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}<p className="verification-note">Provider-reported completion and browser observations are labeled separately. A completed run is not an independent confirmation of an external booking or payment.</p></section>}<Timeline events={run.events} compact /></>}
            {tab === 'overview' && <VerificationPanel run={run} pending={pending} onAction={orchestra.action} />}
            {tab === 'evidence' && <EvidencePanel run={run} />}
            {tab === 'trace' && <Timeline events={run.events} />}
          </div>
        </>}
        <footer className="workspace-footer"><span><AudioLines size={13} /> Fo-chestra</span><p>Observe. Coordinate. Verify.</p><span>Mastra + Stagehand v3 + Fo</span></footer>
      </main>
    </div>
    {setupOpen && <SetupDrawer readiness={readiness} onClose={() => setSetupOpen(false)} onRefresh={orchestra.refreshReadiness} />}
  </div>;
}

function Metric({ label, value, accent, icon }: { label: string; value: string; accent?: boolean; icon?: React.ReactNode }) {
  return <div className={`metric ${accent ? 'accent' : ''}`}><span>{icon}{label}</span><strong>{value}</strong></div>;
}
