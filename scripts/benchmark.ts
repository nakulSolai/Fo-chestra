import { mkdirSync, writeFileSync } from 'node:fs';
import { sandboxRun } from './smoke.js';

const repetitions = Number(process.env.BENCHMARK_REPETITIONS || 3);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) throw new Error('Use 1–5 benchmark repetitions.');
const runs = [];
for (let i = 0; i < repetitions; i++) {
  // Alternate order to reduce systematic warm-start bias. Every run uses actual local browser sessions.
  for (const strategy of (i % 2 ? ['parallel', 'sequential'] : ['sequential', 'parallel']) as ('parallel' | 'sequential')[]) {
    const run = await sandboxRun(strategy);
    runs.push({ strategy, repetition: i + 1, runId: run.id, ...run.metrics });
    console.log(`${strategy} ${i + 1}: ${Math.round(run.metrics.elapsedMs)} ms, overlap ${Math.round(run.metrics.overlapMs)} ms`);
  }
}
function median(values: number[]) { const sorted = values.toSorted((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; }
const sequentialMs = median(runs.filter(r => r.strategy === 'sequential').map(r => r.elapsedMs));
const parallelMs = median(runs.filter(r => r.strategy === 'parallel').map(r => r.elapsedMs));
const result = { measuredAt: new Date().toISOString(), source: 'controlled local browser fixtures and simulated Fo waits', repetitions, runs,
  median: { sequentialMs, parallelMs, ratio: sequentialMs / parallelMs }, limitations: ['Timing includes browser startup and automatic local approval.', 'Fo wait is simulated; no real-world latency or success advantage is established.', 'Small sample; results are specific to this machine and workload.'] };
mkdirSync('.data/validation', { recursive: true }); writeFileSync('.data/validation/benchmark.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.median));
