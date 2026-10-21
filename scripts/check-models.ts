import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.ANTHROPIC_API_KEY) throw new Error('Configure the local Anthropic key before checking model access.');
const response = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(20_000) });
if (!response.ok) throw new Error(`Anthropic model-list check returned HTTP ${response.status}; response bodies withheld.`);
const data = await response.json() as { data: { id: string }[] };
const result = { checkedAt: new Date().toISOString(), authenticated: true, inferenceRequests: 0,
  models: ['opus', 'sonnet', 'haiku'].map(family => { const id = `claude-${family}-5-5`; return { id, listed: data.data.some(model => model.id === id || model.id.startsWith(`${id}-`)) }; }),
  note: 'A model listing verifies authentication and discovery; a generated response is a separate check.' };
mkdirSync('.data/validation', { recursive: true }); writeFileSync('.data/validation/models.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
