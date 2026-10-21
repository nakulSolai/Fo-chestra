import { describe, expect, it } from 'vitest';
import { isPublicAddress, parseResearchUrl, validatePlan } from '../src/browser/policy.js';

describe('research network boundary', () => {
  it.each(['http://127.0.0.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/', 'http://10.0.0.1/', 'http://localhost/', 'https://workstation.local/',
    'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pass@example.com/', 'https://example.com:8443/'])('rejects live target %s', value => {
    expect(() => parseResearchUrl(value, { mode: 'live' })).toThrow();
  });
  it('permits public web URL syntax', () => expect(parseResearchUrl('https://www.wikipedia.org/', { mode: 'live' }).hostname).toBe('www.wikipedia.org'));
  it('restricts sandbox to the exact configured origin', () => {
    const policy = { mode: 'sandbox' as const, fixtureOrigin: 'http://127.0.0.1:4318' };
    expect(parseResearchUrl('http://127.0.0.1:4318/fixtures/comparison/alpha', policy).port).toBe('4318');
    expect(() => parseResearchUrl('http://127.0.0.1:4319/fixtures/comparison/alpha', policy)).toThrow();
    expect(() => parseResearchUrl('http://localhost:4318/', policy)).toThrow();
    expect(() => parseResearchUrl('https://www.wikipedia.org/', policy)).toThrow();
  });
  it.each(['0.0.0.0', '100.64.0.1', '172.20.0.1', '192.168.1.5', '198.18.0.1', '224.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1'])('rejects special address %s', value => expect(isPublicAddress(value)).toBe(false));
  it('accepts ordinary global addresses', () => { expect(isPublicAddress('8.8.8.8')).toBe(true); expect(isPublicAddress('2606:4700:4700::1111')).toBe(true); });
  it('rejects cycles and unknown dependencies before opening a browser', async () => {
    const item = { id: 'a', title: 'A', url: 'http://127.0.0.1:4318/fixtures/comparison/alpha', objective: 'Read', dependsOn: ['b'] };
    const policy = { mode: 'sandbox' as const, fixtureOrigin: 'http://127.0.0.1:4318' };
    await expect(validatePlan({ summary: 'Test', workItems: [item], uncertainties: [] }, policy)).rejects.toThrow('dependency');
    await expect(validatePlan({ summary: 'Test', workItems: [item, { ...item, id: 'b', dependsOn: ['a'] }], uncertainties: [] }, policy)).rejects.toThrow('cycle');
  });
});
