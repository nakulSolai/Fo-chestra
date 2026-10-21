import { config } from './config.js';
import { serve } from '@hono/node-server';
import { RunEngine } from './engine.js';
import { createApp } from './app.js';

const origin = `http://127.0.0.1:${config.port}`;
const engine = new RunEngine({ dataDir: config.dataDir, origin, maxWorkers: config.maxWorkers, liveFoEnabled: config.liveFoEnabled });
const server = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: config.port }, () => console.log(`Fo-chestra ready at ${origin}. Live Fo actions: ${config.liveFoEnabled ? 'enabled with exact approval' : 'disabled'}.`));
let closing = false;
async function close() { if (closing) return; closing = true; server.close(); await engine.close(); process.exit(0); }
process.on('SIGINT', () => { void close(); }); process.on('SIGTERM', () => { void close(); });
