import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { RunMode, Plan } from '../shared/types.js';

export interface UrlPolicy { mode: RunMode; fixtureOrigin?: string }
export class BrowserPolicyError extends Error { override name = 'BrowserPolicyError'; }

/** A conservative public-address check; mixed public/private DNS answers fail closed. */
export function isPublicAddress(value: string): boolean {
  const address = value.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
  }
  // Accept global-unicast IPv6 only. This excludes loopback, ULA, mapped IPv4,
  // link-local, multicast, NAT64 and other special-use ranges.
  const second = address.split(':')[1];
  return isIP(address) === 6 && /^[23]/.test(address) &&
    !address.startsWith('2001:db8:') && !(address.startsWith('2001:') && (!second || Number.parseInt(second, 16) < 512)) &&
    !address.startsWith('2002:');
}

export function parseResearchUrl(value: string, policy: UrlPolicy): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new BrowserPolicyError('An absolute HTTP(S) URL is required.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new BrowserPolicyError('Only HTTP(S) URLs without embedded credentials are allowed.');
  }
  if (url.href.length > 2_048) throw new BrowserPolicyError('URL is too long.');
  if (policy.mode === 'sandbox') {
    let fixture: URL;
    try { fixture = new URL(policy.fixtureOrigin ?? ''); } catch { throw new BrowserPolicyError('A trusted fixture origin is required.'); }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(fixture.hostname) ||
        fixture.protocol !== 'http:' || fixture.username || fixture.password ||
        fixture.pathname !== '/' || fixture.search || fixture.hash || url.origin !== fixture.origin) {
      throw new BrowserPolicyError('Sandbox research is restricted to the exact trusted loopback fixture origin.');
    }
  } else {
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'localhost' || host.endsWith('.localhost') || !host.includes('.') && !host.includes(':') ||
        /\.(local|internal|home|lan|test|invalid|example)$/.test(host) ||
        (isIP(host.replace(/^\[|\]$/g, '')) && !isPublicAddress(host))) {
      throw new BrowserPolicyError('Live research requires a public internet address.');
    }
    if (url.port && !['80', '443'].includes(url.port)) throw new BrowserPolicyError('Live research allows only standard web ports.');
  }
  return url;
}

export async function validateResearchUrl(value: string, policy: UrlPolicy): Promise<URL> {
  const url = parseResearchUrl(value, policy);
  if (policy.mode === 'live') {
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    const answers = await resolvePublicHost(host);
    if (!answers.length || answers.some(answer => !isPublicAddress(answer.address))) {
      throw new BrowserPolicyError('URL resolves to a private or special-use network.');
    }
  }
  return url;
}

export async function resolvePublicHost(host: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([lookup(host, { all: true }), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new BrowserPolicyError('Public hostname resolution timed out.')), 4000);
      timer.unref();
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function validatePlan(plan: Plan, policy: UrlPolicy): Promise<Plan> {
  if (!plan.workItems.length || plan.workItems.length > 6) throw new BrowserPolicyError('A plan needs 1–6 bounded research items.');
  const ids = new Set<string>();
  for (const item of plan.workItems) {
    if (!/^[a-zA-Z0-9_-]{1,48}$/.test(item.id) || ids.has(item.id)) throw new BrowserPolicyError('Plan item IDs must be unique and safe.');
    ids.add(item.id);
    await validateResearchUrl(item.url, policy);
  }
  const done = new Set<string>();
  for (const item of plan.workItems) {
    if (item.dependsOn.some(id => !ids.has(id) || id === item.id)) throw new BrowserPolicyError('Plan contains an invalid dependency.');
  }
  while (done.size < ids.size) {
    const ready = plan.workItems.filter(item => !done.has(item.id) && item.dependsOn.every(id => done.has(id)));
    if (!ready.length) throw new BrowserPolicyError('Plan dependencies contain a cycle.');
    ready.forEach(item => done.add(item.id));
  }
  return plan;
}
