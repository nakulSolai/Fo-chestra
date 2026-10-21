import { spawn, execFileSync } from 'node:child_process';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { chromium, type CDPSession, type Page } from '@playwright/test';
import type { Run } from '../src/shared/types.js';

/** One continuous, silent browser-only take. No provider calls, live approvals,
 * uploads, dependency downloads, server restarts, or desktop/private-tab capture.
 * Run after the recording view is built: npx tsx scripts/record-demo.ts
 * Read-only preflight: npx tsx scripts/record-demo.ts --check
 * Existing system ffmpeg is reused because Playwright's video helper otherwise
 * requires its own downloaded ffmpeg. Public CDP supplies the viewport frames. */
const appUrl = new URL(process.env.DEMO_ORIGIN ?? 'http://127.0.0.1:4318');
if (appUrl.protocol !== 'http:' || appUrl.hostname !== '127.0.0.1' || appUrl.pathname !== '/') throw new Error('DEMO_ORIGIN must be a loopback HTTP origin.');
const origin = appUrl.origin;
const recordingUrl = `${origin}/?record=1`;
const durationSeconds = 118;
const fps = 8;
const viewport = { width: 1920, height: 1080 };
const wait = (ms: number) => new Promise<void>(done => setTimeout(done, Math.max(0, ms)));

async function readApi<T>(path: string): Promise<T> {
  const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`Read-only preflight failed: ${path} (${response.status}).`);
  return await response.json() as T;
}
async function assertSafeHealth() {
  const health = await readApi<{ ok: boolean; service: string; liveActions: boolean }>('/api/health');
  if (!health.ok || health.service !== 'fo-chestra' || health.liveActions !== false) throw new Error('Recording requires the Fo-chestra server with liveActions=false.');
}
function systemFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (process.platform === 'win32') return execFileSync('where.exe', ['ffmpeg'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/)[0]!;
  return 'ffmpeg';
}

class ViewportRecorder {
  private encoder?: ReturnType<typeof spawn>;
  private session?: CDPSession;
  private timer?: ReturnType<typeof setInterval>;
  private latest?: Buffer;
  private written = 0;
  private started = 0;
  private blocked = false;
  private ending = false;
  private stderr = '';
  private finished?: Promise<void>;

  async start(page: Page, ffmpeg: string, output: string) {
    this.latest = await page.screenshot({ type: 'jpeg', quality: 78 });
    this.encoder = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0',
      '-an', '-vf', `scale=${viewport.width}:${viewport.height}`, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-threads', '2', '-row-mt', '1', '-crf', '36', '-b:v', '0', output],
    { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    const encoder = this.encoder;
    encoder.stderr?.on('data', value => { this.stderr = (this.stderr + String(value)).slice(-5000); });
    encoder.stdin?.on('error', () => {});
    this.finished = new Promise<void>((done, reject) => {
      encoder.once('error', reject);
      encoder.once('close', code => code === 0 ? done() : reject(new Error(`Video encoder exited ${code}: ${this.stderr}`)));
    });
    void this.finished.catch(() => {});
    this.session = await page.context().newCDPSession(page);
    this.session.on('Page.screencastFrame', event => {
      this.latest = Buffer.from(event.data, 'base64');
      void this.session!.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
    });
    await this.session.send('Page.startScreencast', { format: 'jpeg', quality: 78, maxWidth: viewport.width, maxHeight: viewport.height, everyNthFrame: 1 });
    this.started = performance.now();
    encoder.stdin?.on('drain', () => { this.blocked = false; if (!this.ending) this.flush(); });
    this.timer = setInterval(() => this.flush(), 1000 / fps);
    this.flush();
  }
  private flush(target = Math.floor((performance.now() - this.started) / 1000 * fps) + 1) {
    if (this.blocked || !this.latest || !this.encoder?.stdin || this.encoder.stdin.destroyed) return;
    while (this.written < target) {
      this.written++;
      if (!this.encoder.stdin.write(this.latest)) { this.blocked = true; return; }
    }
  }
  async stop() {
    this.ending = true;
    if (this.timer) clearInterval(this.timer);
    const elapsedSeconds = (performance.now() - this.started) / 1000;
    const target = Math.ceil(elapsedSeconds * fps);
    const deadline = performance.now() + 15_000;
    while (this.written < target && performance.now() < deadline) {
      this.flush(target);
      if (this.blocked && this.encoder?.stdin && !this.encoder.stdin.destroyed) await Promise.race([once(this.encoder.stdin, 'drain'), wait(500)]);
    }
    await this.session?.send('Page.stopScreencast').catch(() => {});
    this.encoder?.stdin?.end();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([this.finished, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Video finalization exceeded 20 seconds.')), 20_000); })]);
    } finally { if (timer) clearTimeout(timer); }
    return { elapsedSeconds, frames: this.written, fps, width: viewport.width, height: viewport.height };
  }
}

async function caption(page: Page, text: string) {
  await page.evaluate(message => {
    let element = document.getElementById('demo-narration-caption');
    if (!element) {
      element = document.createElement('div'); element.id = 'demo-narration-caption'; document.body.append(element);
      Object.assign(element.style, { position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: '10000',
        maxWidth: '1440px', width: 'max-content', padding: '12px 22px', borderRadius: '12px', background: 'rgba(13,21,39,.96)',
        color: '#f5f3ed', font: '500 18px/1.5 system-ui,sans-serif', textAlign: 'center', border: '1px solid rgba(122,220,210,.5)',
        boxShadow: '0 8px 32px rgba(0,0,0,.2)', pointerEvents: 'none' });
    }
    element.textContent = message;
  }, text);
}

async function main() {
  await assertSafeHealth();
  const ffmpeg = systemFfmpeg();
  execFileSync(ffmpeg, ['-version'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
  const encoderHelp = execFileSync(ffmpeg, ['-hide_banner', '-h', 'encoder=libvpx-vp9'], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
  if (!encoderHelp.includes('Encoder libvpx-vp9')) throw new Error('The existing ffmpeg lacks the required WebM VP9 encoder.');
  const runs = await readApi<Run[]>('/api/runs');
  const historical = runs.find(run => run.mode === 'live' && run.status === 'partial' && run.verification?.status === 'partial' && run.fo.status === 'complete');
  const fallback = runs.find(run => run.mode === 'sandbox' && run.status === 'completed' && run.fo.simulated && run.fo.status === 'complete'
    && run.metrics.maxConcurrentWorkers >= 2 && run.workers.some(worker => worker.speculative && worker.screenshot));
  if (!historical || !fallback) throw new Error('Recording needs an existing genuine partial live receipt and a completed parallel sandbox fallback.');
  if (runs.some(run => !['completed', 'partial', 'failed', 'cancelled', 'interrupted'].includes(run.status))) throw new Error('Finish the current local run before recording.');
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({ ready: true, recordingUrl, liveActions: false, historicalRunId: historical.id, fallbackRunId: fallback.id, encoder: ffmpeg, durationSeconds, fps, viewport }));
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = resolve('demo-recordings', `fo-chestra-demo-${stamp}`);
  await mkdir(directory, { recursive: true });
  const output = join(directory, 'demo.webm');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync'] });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(6500);
  let createdId: string | undefined;
  let fallbackUsed = false;
  let recorder: ViewportRecorder | undefined;
  let video: Awaited<ReturnType<ViewportRecorder['stop']>> | undefined;
  const chapters: { atSeconds: number; label: string }[] = [];
  let began = 0;
  let failure: string | undefined;
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (!['GET', 'HEAD'].includes(request.method())) {
      const payload = request.postDataJSON() as { mode?: string; strategy?: string } | null;
      const create = url.pathname === '/api/runs' && payload?.mode === 'sandbox' && payload.strategy === 'parallel';
      const ownAction = createdId && new RegExp(`^/api/runs/${createdId}/(approve|cancel|reject)$`).test(url.pathname);
      if (!create && !ownAction) return route.abort('blockedbyclient');
    }
    await route.continue();
  });
  const at = async (seconds: number) => { await wait(seconds * 1000 - (performance.now() - began)); };
  const chapter = async (label: string, text: string) => { chapters.push({ atSeconds: Math.round((performance.now() - began) / 100) / 10, label }); await caption(page, text); };
  const selectSaved = async () => {
    fallbackUsed = true;
    if (createdId) {
      const current = await readApi<Run>(`/api/runs/${createdId}`);
      if (!['completed', 'partial', 'failed', 'cancelled', 'interrupted'].includes(current.status)) await page.getByTestId('cancel-run').click();
    }
    await page.locator(`[data-testid="history-run"][data-run-id="${fallback.id}"]`).click();
    await page.getByTestId('run-goal').waitFor();
    await chapter('Explicit saved sandbox fallback', 'Saved sandbox replay: genuine previously captured browser evidence; simulated Fo. No new live action.');
  };
  try {
    await page.goto(recordingUrl, { waitUntil: 'networkidle', timeout: 15_000 });
    // Refuse capture until the real app's synchronous redacted recording view exists.
    await page.getByTestId('recording-show-live').waitFor();
    await page.getByTestId('recording-show-benchmark').waitFor();
    await page.getByTestId('goal-input').waitFor();
    await assertSafeHealth();
    recorder = new ViewportRecorder();
    await recorder.start(page, ffmpeg, output); began = performance.now();
    await chapter('One goal, one workspace', 'Fo-chestra coordinates browser research, human approval, and independently checked outcomes.');
    await at(8);
    await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
    await page.getByTestId('goal-input').pressSequentially('Compare dinner options for eight people under $160. Check vegetarian choices and pickup availability, keep a backup ready, and prepare one inquiry for review.', { delay: 9 });
    await page.getByTestId('strategy-select').selectOption('parallel');
    await chapter('Sandbox disclosure', 'This fresh demonstration uses real local browser fixtures, simulated planning, and simulated Fo.');
    await at(16);
    const creation = page.waitForResponse(response => response.url() === `${origin}/api/runs` && response.request().method() === 'POST');
    await page.getByTestId('start-run').click();
    const response = await creation; const created = await response.json() as Run;
    if (!response.ok() || created.mode !== 'sandbox' || !created.fo.simulated) throw new Error('UI did not create the required sandbox run.');
    createdId = created.id;
    await page.getByTestId('worker-card').first().waitFor();
    await chapter('Actual browser work', 'Two isolated browser workers research concurrently. Captured sources and screenshots remain inspectable.');
    const researchDeadline = performance.now() + 20_000;
    let state = created;
    while (performance.now() < researchDeadline) {
      state = await readApi<Run>(`/api/runs/${createdId}`);
      if (state.status === 'awaiting_approval' || ['failed', 'partial', 'cancelled'].includes(state.status)) break;
      await wait(500);
    }
    if (state.status !== 'awaiting_approval') await selectSaved();
    else {
      if (state.metrics.maxConcurrentWorkers < 2) throw new Error('The fresh run did not demonstrate actual concurrent browser workers.');
      await at(37);
      await page.getByTestId('approval-panel').scrollIntoViewIfNeeded();
      await chapter('Exact approval boundary', 'Review the exact target, message, zero-spend limit, and payload fingerprint before approving the simulation.');
      await page.getByRole('button', { name: /Bound to this payload/ }).click();
      await at(48);
      const safe = await readApi<Run>(`/api/runs/${createdId}`);
      if (safe.mode !== 'sandbox' || !safe.fo.simulated || safe.status !== 'awaiting_approval') throw new Error('Simulation approval guard failed.');
      await assertSafeHealth();
      await page.getByTestId('approve-action').click();
      await chapter('Overlap and backup', 'Fo is simulated here. While it waits, the backup browser keeps preparing evidence.');
      await page.getByTestId('fo-panel').scrollIntoViewIfNeeded();
      await at(62);
      const finished = await readApi<Run>(`/api/runs/${createdId}`);
      if (finished.status !== 'completed' || finished.fo.status !== 'complete') await selectSaved();
    }
    await at(64);
    await page.getByRole('tab', { name: /^Evidence/ }).click();
    await chapter('Evidence and provenance', fallbackUsed ? 'Saved sandbox evidence is labeled as replay. Fixture observations are distinct from live service outcomes.' : 'Inspect the actual fixture observations. A model recommendation and a provider report are separate evidence types.');
    await at(73);
    await page.getByTestId('recording-show-live').click();
    await page.getByTestId('run-status').filter({ hasText: 'Partial result' }).waitFor();
    await chapter('Historical approved live test', 'Historical live test: one email was already sent with explicit approval. Opening this result sends nothing.');
    await at(85);
    await page.getByTestId('verification-panel').scrollIntoViewIfNeeded();
    await page.getByTestId('receipt-checks').waitFor();
    await chapter('Independent verification found a deviation', 'Gmail confirmed delivery. Fo added a footer and HTML, so exact-body and plain-text checks failed: partial, not full success.');
    await at(99);
    await page.getByTestId('recording-show-benchmark').click();
    await page.getByTestId('recording-benchmark').waitFor();
    await page.getByTestId('recording-benchmark').scrollIntoViewIfNeeded();
    await chapter('Measured comparison', 'Measured fixture benchmark: compare equivalent sequential and parallel workloads. Fo wait is simulated; live speedup remains untested.');
    await at(112);
    await chapter('Observe. Coordinate. Verify.', 'Human approval controls consequential actions. Independent evidence determines what actually succeeded.');
    await at(durationSeconds);
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Recording failed.';
    throw error;
  } finally {
    if (recorder) video = await recorder.stop().catch(error => { failure ??= String(error); return undefined; });
    if (failure && createdId) {
      // Release only this script's own sandbox, through its real UI. A failed
      // take must not leave a pending local approval blocking the next take.
      await (async () => {
        const own = await readApi<Run>(`/api/runs/${createdId}`);
        if (own.mode === 'sandbox' && !['completed', 'partial', 'failed', 'cancelled', 'interrupted'].includes(own.status)) {
          await page.locator(`[data-testid="history-run"][data-run-id="${createdId}"]`).click();
          await page.getByTestId('cancel-run').click();
        }
      })().catch(() => {});
    }
    await context.close().catch(() => {}); await browser.close().catch(() => {});
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ recordedAt: new Date().toISOString(), recordingUrl, output,
      method: 'One continuous browser viewport capture through public CDP, encoded by existing system ffmpeg; silent, no desktop capture.',
      video, createdSandboxRunId: createdId, fallbackUsed, fallbackRunId: fallbackUsed ? fallback.id : undefined, historicalLiveRunId: historical.id,
      newLiveActions: 0, liveActionsEnabled: false, chapters, status: failure ? 'incomplete' : 'complete', failure }, null, 2));
  }
  if (!video || video.elapsedSeconds < 110 || video.elapsedSeconds > 125 || (await stat(output)).size < 50_000) throw new Error('Video duration or size check failed; inspect the private recording manifest.');
  await access(output);
  console.log(JSON.stringify({ recorded: true, output, manifest: join(directory, 'manifest.json'), video, fallbackUsed, newLiveActions: 0 }));
}
await main();
