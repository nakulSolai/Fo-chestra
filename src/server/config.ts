import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
if (existsSync('.env')) process.loadEnvFile('.env');
function integer(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
}
export const config = {
  port: integer('PORT', 4318, 1024, 65535),
  maxWorkers: integer('MAX_BROWSER_WORKERS', 2, 1, 4),
  dataDir: resolve('.data'),
  model: process.env.ANTHROPIC_MODEL || 'anthropic/claude-sonnet-5-5',
  liveFoEnabled: process.env.FO_ENABLE_LIVE_ACTIONS === 'true',
};
