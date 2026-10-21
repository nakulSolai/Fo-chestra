import { createServer } from 'node:http';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { research, getBrowserReadiness } from '../src/browser/index.js';

const readiness = await getBrowserReadiness();
if (!readiness.ready) throw new Error(readiness.message);
const server = createServer((_, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Read-only browser smoke</title><h1>Synthetic vendor</h1><p data-price="42">Price: $42. Availability: confirmation required.</p>');
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No fixture address.');
const fixtureOrigin = `http://127.0.0.1:${address.port}`;
const profileRoot = resolve('.data/browser-profiles');
const profiles = async () => new Set(await readdir(profileRoot).catch(() => [] as string[]));
const existing = await profiles();
const observed = new Set<string>();
const workerElapsedMs: number[] = [];
try {
  const outputs = await Promise.all(['first', 'second'].map(async id => {
    const started = performance.now();
    const result = await research({ id, title: id, url: fixtureOrigin, objective: 'Read price and availability.', dependsOn: [] }, { mode: 'sandbox', fixtureOrigin, onProgress: async message => {
    for (const entry of await profiles()) if (!existing.has(entry)) observed.add(entry);
    console.log(`${new Date().toISOString()} ${id}: ${message}`);
    } });
    workerElapsedMs.push(Math.round(performance.now() - started));
    return result;
  }));
  if (outputs.some(output => !output.evidence[0]?.text.includes('$42') || output.usage.length || !output.screenshot)) throw new Error('Browser smoke evidence failed.');
  if (workerElapsedMs.some(elapsed => elapsed > 30_000)) throw new Error('Fixture worker exceeded its 30-second smoke budget, including cleanup.');
  if (observed.size !== 2) throw new Error(`Expected two independent browser profiles; observed ${observed.size}.`);
  const controller = new AbortController();
  let cancelled = false;
  try {
    await research({ id: 'cancelled', title: 'Cancellation check', url: fixtureOrigin, objective: 'Read price.', dependsOn: [] }, {
      mode: 'sandbox', fixtureOrigin, signal: controller.signal,
      onProgress: message => { if (message.startsWith('Reading the supplied page')) controller.abort(new Error('Smoke cancellation.')); },
    });
  } catch { cancelled = controller.signal.aborted; }
  if (!cancelled) throw new Error('Browser worker did not honor cancellation.');
  const leaked = [...await profiles()].filter(profile => !existing.has(profile));
  if (leaked.length) throw new Error(`Browser profiles were not cleaned up: ${leaked.length}.`);
  console.log(JSON.stringify({ passed: true, browser: readiness.executable, isolatedWorkers: outputs.length, source: 'fixture', inferenceRequests: 0, cancellationVerified: true, leakedProfiles: 0, workerElapsedMs }));
} finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
