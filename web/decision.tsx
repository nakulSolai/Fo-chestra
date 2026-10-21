import { ArrowUpRight, ChevronDown, CircleHelp, Scale } from 'lucide-react';
import type { Run } from '../src/shared/types';
import { safeUrl } from './format';

export function DecisionPanel({ run, onEvidence }: { run: Run; onEvidence: () => void }) {
  const decision = run.decision;
  if (!decision) return null;
  const source = run.workers.find(worker => worker.id === decision.recommendedWorkerId);
  const workerTitle = (id: string) => run.workers.find(worker => worker.id === id)?.title ?? id;
  return <section className="decision-panel" data-testid="decision-panel"><div className="decision-symbol"><Scale size={22} /></div><div className="decision-body"><div className="decision-topline"><h2>Working recommendation</h2><span>{run.mode === 'sandbox' ? 'Fixed fixture comparison rule' : 'Model recommendation'}</span></div><h3>{decision.summary}</h3><p>{decision.rationale}</p>{source && <div className="recommended-source"><span>Recommended source</span>{safeUrl(source.url) ? <a href={safeUrl(source.url)} target="_blank" rel="noreferrer">{source.title}<ArrowUpRight size={12} /></a> : <strong>{source.title}</strong>}</div>}{decision.alternatives.length > 0 && <details className="decision-alternatives"><summary>Why the other options differ<ChevronDown size={12} /></summary><ul>{decision.alternatives.map((option, index) => <li key={`${option.workerId}-${index}`}><strong>{workerTitle(option.workerId)}</strong><span>{option.reason}</span></li>)}</ul></details>}{decision.missingInformation.length > 0 && <div className="decision-gaps"><CircleHelp size={13} /><p>{decision.missingInformation.join(' ')}</p></div>}<button className="text-button" onClick={onEvidence}>Inspect supporting observations<ArrowUpRight size={12} /></button></div></section>;
}
