import { BarChart3, ShieldCheck } from 'lucide-react';
import measurements from './recording-benchmark.json';

export function RecordingToolbar({ hasLive, onLive, onBenchmark }: { hasLive: boolean; onLive: () => void; onBenchmark: () => void }) {
  return <section className="recording-toolbar" data-testid="recording-toolbar">
    <div><ShieldCheck size={18} /><span><strong>Recording view</strong><small>Private live-run text hidden · original evidence statuses preserved</small></span></div>
    <div><button className="secondary-button compact" disabled={!hasLive} onClick={onLive} data-testid="recording-show-live">Saved real Fo result</button><button className="secondary-button compact" onClick={onBenchmark} data-testid="recording-show-benchmark">Measured benchmark</button></div>
  </section>;
}

export function RecordingBenchmark() {
  const median = (values: number[]) => values.toSorted((a, b) => a - b)[1]!;
  const sequential = median(measurements.rows.map(row => row.sequentialMs));
  const parallel = median(measurements.rows.map(row => row.parallelMs));
  return <section className="recording-benchmark" data-testid="recording-benchmark">
    <span className="recording-eyebrow"><BarChart3 size={18} /> SAVED MEASUREMENTS · CONTROLLED WORKLOAD</span>
    <h1>Use the waiting time.</h1><p className="recording-lede">Real fixture browsers. Same workload. Simulated Fo wait.</p>
    <div className="recording-bars">
      <div><span>Sequential median</span><strong>{(sequential / 1000).toFixed(3)} s</strong><i style={{ width: '100%' }} /></div>
      <div className="parallel"><span>Parallel median</span><strong>{(parallel / 1000).toFixed(3)} s</strong><i style={{ width: `${parallel / sequential * 100}%` }} /></div>
    </div>
    <div className="recording-ratio"><strong>{(sequential / parallel).toFixed(2)}×</strong><span>median elapsed-time ratio<br />in this six-run sample</span></div>
    <table><thead><tr><th>Trial</th><th>Sequential</th><th>Parallel</th></tr></thead><tbody>{measurements.rows.map(row => <tr key={row.repetition}><td>{row.repetition}</td><td>{(row.sequentialMs / 1000).toFixed(3)} s</td><td>{(row.parallelMs / 1000).toFixed(3)} s{row.parallelMs > row.sequentialMs ? ' · slower' : ''}</td></tr>)}</tbody></table>
    <p className="recording-limits">Three repetitions per strategy. Trial 3 was slower in parallel. Startup and automatic local approval included; cold/warm cache state was not recorded. This does not establish live Fo speed, lower cost, or a general reliability advantage.</p>
    <small>Measured October 19, 2026 · sanitized snapshot of the actual local benchmark record</small>
  </section>;
}
