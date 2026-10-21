import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { serveStatic } from '@hono/node-server/serve-static';
import { z } from 'zod';
import { getBrowserReadiness } from '../browser/index.js';
import { AuthorizationError } from '../security/action-ledger.js';
import { redactForExport } from './store.js';
import { fixtureRouter } from './fixtures.js';
import type { RunEngine } from './engine.js';
import { publicError } from './errors.js';

const requestSchema = z.object({ goal: z.string().trim().min(5).max(6000), mode: z.enum(['sandbox', 'live']), strategy: z.enum(['parallel', 'sequential']).optional(), urls: z.array(z.string().url().max(2048)).max(6).optional(), scenario: z.enum(['comparison', 'appointments']).optional(), maxWorkers: z.number().int().min(1).max(4).optional(), prepareAction: z.boolean().optional() }).strict();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function createApp(engine: RunEngine) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    const url = new URL(c.req.url);
    const allowedHosts = new Set([`127.0.0.1:${new URL(engine.options.origin).port}`, `localhost:${new URL(engine.options.origin).port}`]);
    if (!allowedHosts.has(c.req.header('host') ?? url.host)) return c.json({ error: 'Unexpected local host.' }, 403);
    const origin = c.req.header('origin');
    if (origin && origin !== engine.options.origin && origin !== engine.options.origin.replace('127.0.0.1', 'localhost')) return c.json({ error: 'Cross-origin access denied.' }, 403);
    if (!['GET', 'HEAD'].includes(c.req.method)) {
      if (Number(c.req.header('content-length') ?? 0) > 32_768) return c.json({ error: 'Request too large.' }, 413);
      if (!c.req.header('content-type')?.startsWith('application/json')) return c.json({ error: 'JSON content type required.' }, 415);
      const text = await c.req.text();
      if (Buffer.byteLength(text, 'utf8') > 32_768) return c.json({ error: 'Request too large.' }, 413);
    }
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    c.header('Cache-Control', 'no-store');
    await next();
  });
  app.onError((error, c) => {
    const message = error instanceof z.ZodError ? error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') : publicError(error);
    return c.json({ error: message }, error instanceof z.ZodError ? 400 : error instanceof AuthorizationError ? 403 : 409);
  });
  app.use('/api/runs/:id/*', async (c, next) => { if (!uuid.test(c.req.param('id'))) return c.json({ error: 'Invalid run identifier.' }, 400); if (!engine.store.get(c.req.param('id'))) return c.json({ error: 'Run not found.' }, 404); await next(); });
  app.get('/api/health', c => c.json({ ok: true, service: 'fo-chestra', liveActions: engine.options.liveFoEnabled }));
  app.get('/api/readiness', async c => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const auth = engine.liveFo.getAuthState();
    const discovery = engine.liveFo.getDiscoveryState();
    return c.json({ browser: await getBrowserReadiness(), anthropic: { configured: !!process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || 'anthropic/claude-sonnet-5-5', verified: engine.anthropicVerified },
      fo: { configured: !!process.env.FO_ACCESS_TOKEN || !!process.env.FO_MCP_URL || auth.authenticated, connected: discovery.connected, auth: auth.authenticated ? 'authenticated session' : auth.status, message: engine.options.liveFoEnabled ? 'Live actions enabled; discovered tools and exact action approval remain required.' : 'Live actions disabled. Sandbox is available.', tools: discovery.tools },
      versions: { node: process.versions.node, stagehand: pkg.dependencies['@browserbasehq/stagehand'], mastra: pkg.dependencies['@mastra/core'] }, maxWorkers: engine.options.maxWorkers });
  });
  app.get('/api/scenarios', c => c.json([{ id: 'comparison', title: 'Compare workshop kits', goal: 'Compare workshop kits for 30 participants. Capture price and availability, and prepare an inquiry with a backup option.' }, { id: 'appointments', title: 'Recover from an unavailable slot', goal: 'Find a fixture appointment slot, compare an available backup, and prepare a confirmation inquiry.' }]));
  app.get('/api/runs', c => c.json(engine.store.list()));
  app.post('/api/runs', async c => c.json(engine.start(requestSchema.parse(await c.req.json())), 201));
  app.get('/api/runs/:id', c => { const run = uuid.test(c.req.param('id')) ? engine.store.get(c.req.param('id')) : undefined; return run ? c.json(run) : c.json({ error: 'Run not found.' }, 404); });
  app.post('/api/runs/:id/approve', async c => { const { fingerprint } = z.object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(await c.req.json()); return c.json(await engine.approve(c.req.param('id'), fingerprint)); });
  app.post('/api/runs/:id/reject', c => c.json(engine.reject(c.req.param('id'))));
  app.post('/api/runs/:id/cancel', c => c.json(engine.cancel(c.req.param('id'))));
  app.post('/api/runs/:id/answer', async c => { const { message } = z.object({ message: z.string().trim().min(1).max(6000) }).strict().parse(await c.req.json()); return c.json(engine.prepareAnswer(c.req.param('id'), message)); });
  app.post('/api/runs/:id/action', async c => {
    const input = z.object({ target: z.string().trim().min(1).max(500), operation: z.enum(['email', 'call', 'inquiry']), message: z.string().trim().min(1).max(16000), maxSpendCents: z.number().int().min(0).max(100000) }).strict().parse(await c.req.json());
    return c.json(engine.replaceAction(c.req.param('id'), input));
  });
  app.post('/api/runs/:id/poll', async c => c.json(await engine.poll(c.req.param('id'))));
  app.post('/api/runs/:id/verify', async c => {
    const checks = z.object({ deliveryObserved: z.boolean(), recipientMatches: z.boolean(), subjectMatches: z.boolean(), bodyMatches: z.boolean(), noAttachments: z.boolean(), plainTextOnly: z.boolean() }).strict();
    const input = z.object({ confirmed: z.literal(true), observed: z.boolean(), note: z.string().trim().min(10).max(2000), reference: z.string().trim().min(3).max(500), method: z.enum(['human_receipt', 'operator_gmail_receipt']).optional(), checks: checks.optional() }).strict().parse(await c.req.json());
    return c.json(engine.recordVerification(c.req.param('id'), input));
  });
  app.get('/api/runs/:id/export', c => { c.header('Content-Disposition', `attachment; filename="fo-chestra-${c.req.param('id')}.json"`); return c.json(redactForExport(engine.required(c.req.param('id')))); });
  app.get('/api/runs/:id/workers/:worker/screenshot', c => {
    const worker = c.req.param('worker'); if (!/^[a-zA-Z0-9_-]{1,48}$/.test(worker)) return c.json({ error: 'Invalid worker identifier.' }, 400);
    const path = join(engine.options.dataDir, 'screenshots', c.req.param('id'), `${worker}.png`);
    if (!existsSync(path)) return c.json({ error: 'Screenshot not captured.' }, 404);
    c.header('Content-Type', 'image/png'); return c.body(readFileSync(path));
  });
  app.get('/api/runs/:id/events', c => streamSSE(c, async stream => {
    const id = c.req.param('id'); let closed = false; let resolveClose: () => void = () => {};
    const done = new Promise<void>(resolve => { resolveClose = resolve; });
    const emit = (run: ReturnType<RunEngine['required']>) => { if (!closed) void stream.writeSSE({ event: 'run', id: String(run.events.at(-1)?.id ?? 0), data: JSON.stringify(run) }).catch(() => resolveClose()); };
    const unsubscribe = engine.subscribe(id, emit); emit(engine.required(id));
    const timer = setInterval(() => { void stream.writeSSE({ event: 'heartbeat', data: '{}' }).catch(resolveClose); }, 15000);
    stream.onAbort(resolveClose);
    try { await done; } finally { closed = true; clearInterval(timer); unsubscribe(); }
  }));
  app.post('/api/fo/discover', async c => c.json(await engine.liveFo.discover()));
  app.post('/api/fo/connect', async c => c.json(await engine.liveFo.startOAuth()));
  app.get('/api/fo/callback', async c => { const code = c.req.query('code'); const state = c.req.query('state'); if (!code || !state) return c.text('Missing OAuth response.', 400); await engine.liveFo.finishOAuth(code, state); return c.redirect('/'); });
  app.route('/fixtures', fixtureRouter);
  app.use('/assets/*', serveStatic({ root: './dist' }));
  app.get('*', c => existsSync('dist/index.html') ? c.html(readFileSync('dist/index.html', 'utf8')) : c.text('Build the UI with npm run build, then refresh this page.', 503));
  return app;
}
