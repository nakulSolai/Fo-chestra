import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isPublicAddress, parseResearchUrl, resolvePublicHost, BrowserPolicyError } from './policy.js';

/** Fetch on a validated, pinned address so Chromium cannot resolve a public name
 * again to a private address. Redirects are returned to the intercepted browser,
 * where the next URL goes through the same policy; Node never follows them. */
export async function readPublicResource(value: string, method: 'GET' | 'HEAD', signal: AbortSignal): Promise<{
  status: number; headers: Record<string, string>; body: Buffer;
}> {
  const url = parseResearchUrl(value, { mode: 'live' });
  const answers = await resolvePublicHost(url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, ''));
  if (!answers.length || answers.some(answer => !isPublicAddress(answer.address))) throw new BrowserPolicyError('Resource DNS includes a private or special address.');
  const pinned = answers[0]!;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method, signal, family: pinned.family, headers: { 'user-agent': 'Fo-chestra read-only research', accept: '*/*', 'accept-encoding': 'identity' },
      lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
      timeout: 8000,
    }, response => {
      const chunks: Buffer[] = [];
      let length = 0;
      response.on('data', (chunk: Buffer) => {
        length += chunk.length;
        if (length > 3_000_000) { response.destroy(new BrowserPolicyError('Resource exceeds the research size limit.')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.headers)) {
          if (value && !['connection', 'transfer-encoding', 'content-length', 'set-cookie', 'set-cookie2'].includes(key)) headers[key] = Array.isArray(value) ? value.join(', ') : value;
        }
        resolve({ status: response.statusCode ?? 502, headers, body: Buffer.concat(chunks) });
      });
    });
    request.on('timeout', () => request.destroy(new Error('Read-only resource timed out.')));
    request.on('error', reject);
    request.end();
  });
}
