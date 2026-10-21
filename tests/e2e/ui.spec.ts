import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import type { Readiness, Run } from '../../src/shared/types';

const createdRunIds = new Set<string>();
test.afterEach(async ({ request }) => {
  for (const id of createdRunIds) {
    await request.post(`/api/runs/${id}/cancel`, { data: {}, headers: { Origin: 'http://127.0.0.1:4318' } }).catch(() => undefined);
  }
  createdRunIds.clear();
});

async function startSandbox(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByTestId('example-comparison').click();
  const created = page.waitForResponse(response => response.url().endsWith('/api/runs') && response.request().method() === 'POST');
  await page.getByTestId('start-run').click();
  const response = await created;
  expect(response.status()).toBe(201);
  const run = await response.json() as Run;
  createdRunIds.add(run.id);
  expect(run.mode).toBe('sandbox');
  await expect(page.getByTestId('approve-action')).toBeVisible({ timeout: 60_000 });
  return run.id;
}

async function getRun(request: APIRequestContext, id: string): Promise<Run> {
  const response = await request.get(`/api/runs/${id}`);
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<Run>;
}

test('real sandbox browser evidence is reviewable and rejection does not dispatch', async ({ page, request }, testInfo) => {
  const id = await startSandbox(page);
  const prepared = await getRun(request, id);
  expect(prepared.action?.status).toBe('pending');
  expect(prepared.fo.simulated).toBe(true);
  expect(prepared.fo.status).toBe('idle');
  const readyWorkers = prepared.workers.filter(worker => worker.status === 'ready');
  expect(readyWorkers).toHaveLength(2);
  expect(readyWorkers.every(worker => worker.evidence.length > 0)).toBeTruthy();
  expect(prepared.workers.some(worker => worker.speculative && worker.status === 'queued')).toBeTruthy();
  await expect(page.getByTestId('worker-card')).toHaveCount(prepared.workers.length);
  await expect(page.getByTestId('approval-message')).toContainText(prepared.action!.message);
  await expect(page.getByTestId('approval-target')).toHaveText(prepared.action!.target);
  for (const worker of readyWorkers) {
    expect(worker.screenshot).toBeTruthy();
    const screenshot = await request.get(`/api/runs/${id}/workers/${worker.id}/screenshot`);
    expect(screenshot.ok()).toBeTruthy();
    expect(screenshot.headers()['content-type']).toMatch(/^image\//);
    expect((await screenshot.body()).length).toBeGreaterThan(100);
  }
  await page.screenshot({ path: testInfo.outputPath('prepared-workspace.png'), fullPage: true });
  await page.getByTestId('reject-action').click();
  await expect.poll(async () => (await getRun(request, id)).action?.status).toBe('rejected');
  const rejected = await getRun(request, id);
  expect(rejected.fo.status).toBe('idle');
  expect(rejected.action?.conversationId).toBeUndefined();
  await expect(page.getByTestId('approve-action')).toHaveCount(0);
});

test('approved sandbox run exposes actual evidence, final state and redacted export', async ({ page, request }, testInfo) => {
  const id = await startSandbox(page);
  await page.getByTestId('approve-action').click();
  await expect.poll(async () => (await getRun(request, id)).status, { timeout: 60_000 }).toBe('completed');
  await expect(page.getByTestId('run-status')).toHaveText('Run complete');
  await expect(page.getByTestId('run-summary')).toBeVisible();
  await expect(page.getByTestId('decision-panel')).toBeVisible();
  await page.getByTestId('open-verification').click();
  await page.locator('#verification-observed').selectOption('no');
  await page.getByTestId('verification-reference').fill('sandbox fixture inspection');
  await page.getByTestId('verification-note').fill('UI validation exercise only; this does not assert a human checked an external outcome.');
  await expect(page.getByTestId('record-verification')).toBeDisabled();
  await expect(page.getByTestId('verification-attestation')).not.toBeChecked();
  await page.getByTestId('verification-panel').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: testInfo.outputPath('completed-workspace.png'), fullPage: true });
  await page.getByRole('tab', { name: /^Evidence/ }).click();
  await expect(page.getByRole('heading', { name: 'Evidence, with provenance' })).toBeVisible();
  await expect(page.locator('.evidence-item')).not.toHaveCount(0);
  await page.getByRole('tab', { name: /^Run trace/ }).click();
  await expect(page.getByTestId('run-event').first()).toBeVisible();
  const exported = await request.get(`/api/runs/${id}/export`);
  expect(exported.ok()).toBeTruthy();
  const trace = await exported.text();
  expect(trace).toContain(id);
  expect(trace).not.toMatch(/(?:sk-ant-|Bearer\s+[a-zA-Z0-9_-]{15}|wak_[a-zA-Z0-9]{8})/);
  await page.screenshot({ path: testInfo.outputPath('completed-run-trace.png'), fullPage: true });
});

test('missing live configuration opens setup without creating or sending a live run', async ({ page, request }) => {
  const readinessResponse = await request.get('/api/readiness');
  const readiness = await readinessResponse.json() as Readiness;
  await page.route('**/api/readiness', route => route.fulfill({ json: {
    ...readiness,
    anthropic: { ...readiness.anthropic, configured: false, verified: false },
    fo: { ...readiness.fo, connected: false, configured: false },
  } }));
  let created = false;
  page.on('request', event => { if (event.method() === 'POST' && event.url().endsWith('/api/runs')) created = true; });
  await page.goto('/');
  await page.getByTestId('goal-input').fill('Prepare a summary email to my own address, maximum spend $0; wait for approval.');
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(page.getByTestId('start-run')).toHaveText('Review live setup');
  await page.getByTestId('start-run').click();
  await expect(page.getByTestId('setup-drawer')).toBeVisible();
  expect(created).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('setup-drawer')).toHaveCount(0);
});

test('synthetic saved live receipt separates verified delivery from unmet content requirements', async ({ page }, testInfo) => {
  // This is a presentation fixture, not evidence of a real provider or mailbox action.
  const recordedAt = '2026-10-19T12:00:00.000Z';
  const syntheticRun: Run = {
    id: 'synthetic-live-partial-receipt',
    goal: 'Synthetic receipt presentation test: inspect a saved partial outcome.',
    mode: 'live', strategy: 'parallel', status: 'partial',
    createdAt: recordedAt, updatedAt: recordedAt, finishedAt: recordedAt,
    workers: [], events: [], usage: [], uncertainties: [],
    fo: { status: 'complete', simulated: false, response: 'Synthetic provider-reported completion; not destination verification.' },
    summary: 'Synthetic saved receipt confirms delivery while two approved content requirements differ.',
    verification: {
      status: 'partial', method: 'operator_gmail_receipt', recordedAt,
      note: 'Synthetic fixture only: a footer and HTML alternative differ from the approved body and plain-text-only constraint.',
      reference: 'synthetic receipt fixture; no real mailbox was accessed',
      checks: { deliveryObserved: true, recipientMatches: true, subjectMatches: true, bodyMatches: false, noAttachments: true, plainTextOnly: false },
    },
    metrics: { elapsedMs: 0, browserActiveMs: 0, foWaitMs: 0, overlapMs: 0, maxConcurrentWorkers: 0 },
  };
  const syntheticReadiness: Readiness = {
    browser: { ready: false, message: 'Synthetic presentation test; browser workers are not launched.' },
    anthropic: { configured: false, verified: false, model: 'synthetic' },
    fo: { configured: false, connected: false, auth: 'none', message: 'Synthetic saved receipt only.', tools: [] },
    versions: {}, maxWorkers: 2,
  };
  const mutatingRequests: string[] = [];
  await page.route('**/api/**', async route => {
    const incoming = route.request();
    const path = new URL(incoming.url()).pathname;
    if (incoming.method() !== 'GET') {
      mutatingRequests.push(`${incoming.method()} ${path}`);
      await route.abort();
      return;
    }
    if (path === '/api/readiness') await route.fulfill({ json: syntheticReadiness });
    else if (path === '/api/scenarios') await route.fulfill({ json: [] });
    else if (path === '/api/runs') await route.fulfill({ json: [syntheticRun] });
    else if (path === `/api/runs/${syntheticRun.id}`) await route.fulfill({ json: syntheticRun });
    else if (path === `/api/runs/${syntheticRun.id}/events`) {
      await route.fulfill({ contentType: 'text/event-stream', body: `event: run\ndata: ${JSON.stringify(syntheticRun)}\n\n` });
    } else await route.fulfill({ status: 404, json: { error: 'No synthetic fixture for this read-only endpoint.' } });
  });
  await page.goto('/');
  await page.locator(`[data-run-id="${syntheticRun.id}"]`).click();
  await expect(page.getByTestId('run-status')).toHaveText('Partial result');
  await expect(page.getByTestId('run-status')).not.toHaveText('Run complete');
  await expect(page.getByTestId('verification-outcome')).toHaveText('Delivery verified; content requirements differ');
  await expect(page.getByTestId('receipt-checks').locator('li')).toHaveCount(6);
  for (const key of ['deliveryObserved', 'recipientMatches', 'subjectMatches', 'noAttachments']) {
    await expect(page.getByTestId(`receipt-check-${key}`)).toContainText('Pass');
  }
  for (const key of ['bodyMatches', 'plainTextOnly']) {
    await expect(page.getByTestId(`receipt-check-${key}`)).toContainText('Not met');
  }
  await expect(page.getByTestId('fo-panel').locator('.fo-state strong')).toHaveText('Provider complete');
  await expect(page.getByTestId('verification-panel')).toContainText('Separate from the Fo response');
  await expect(page.getByTestId('approve-action')).toHaveCount(0);
  await expect(page.getByTestId('record-verification')).toHaveCount(0);
  expect(mutatingRequests).toEqual([]);
  await page.getByTestId('verification-panel').screenshot({ path: testInfo.outputPath('synthetic-partial-receipt.png') });

  await page.goto('/?record=1');
  await expect(page.getByTestId('recording-show-live')).toBeEnabled();
  await page.getByTestId('recording-show-live').click();
  await expect(page.getByTestId('run-status')).toHaveText('Partial result');
  await expect(page.getByTestId('recording-historical')).toBeVisible();
  await expect(page.getByTestId('verification-outcome')).toHaveText('Delivery verified; content requirements differ');
  expect(mutatingRequests).toEqual([]);

  await page.route('**/api/runs', route => route.fulfill({ json: [] }));
  await page.goto('/?record=1');
  await expect(page.getByTestId('recording-show-live')).toBeDisabled();
  await page.getByTestId('recording-show-benchmark').click();
  await expect(page.getByRole('heading', { name: 'Use the waiting time.' })).toBeVisible();
  expect(mutatingRequests).toEqual([]);
});

test('task interface fits a narrow viewport and navigation remains usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A goal. A coordinated effort.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByTestId('new-run')).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation' }).click();
  await page.screenshot({ path: testInfo.outputPath('mobile-goal-interface.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath('desktop-goal-interface.png'), fullPage: true });
  await page.setViewportSize({ width: 3840, height: 2160 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByTestId('goal-input')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('wide-goal-interface-4k.png'), fullPage: true });
});
