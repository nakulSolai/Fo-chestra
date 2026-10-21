import { randomBytes, timingSafeEqual } from 'node:crypto';
import { auth, type OAuthClientProvider, type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';

export interface FoAuthState { status: 'disconnected' | 'authorizing' | 'connected'; authenticated: boolean; message: string }

/** One local-user session. Tokens and PKCE material are deliberately never serialized. */
export class MemoryOAuthProvider implements OAuthClientProvider {
  private information?: OAuthClientInformationMixed;
  private savedTokens?: OAuthTokens;
  private verifier?: string;
  private pendingState?: string;
  private pendingSince = 0;
  private authorizationUrl?: string;
  private discovery?: OAuthDiscoveryState;
  readonly redirectUrl: string;

  constructor(redirectUrl: string, accessToken?: string) {
    const callback = new URL(redirectUrl);
    if (callback.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(callback.hostname) || callback.username || callback.password) {
      throw new Error('OAuth callback must be an HTTP loopback URL.');
    }
    this.redirectUrl = callback.toString();
    if (accessToken) this.savedTokens = { access_token: accessToken, token_type: 'Bearer' };
  }
  get clientMetadata(): OAuthClientMetadata {
    return { client_name: 'Fo-chestra local', redirect_uris: [this.redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' };
  }
  state(): string {
    if (!this.pendingState) { this.pendingState = randomBytes(32).toString('base64url'); this.pendingSince = Date.now(); }
    return this.pendingState;
  }
  clientInformation(): OAuthClientInformationMixed | undefined { return this.information; }
  saveClientInformation(value: OAuthClientInformationMixed): void { this.information = value; }
  tokens(): OAuthTokens | undefined { return this.savedTokens; }
  saveTokens(value: OAuthTokens): void { this.savedTokens = value; }
  redirectToAuthorization(url: URL): void {
    if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('OAuth authorization must use HTTPS.');
    this.authorizationUrl = url.toString();
  }
  saveCodeVerifier(value: string): void { this.verifier = value; }
  codeVerifier(): string { if (!this.verifier) throw new Error('OAuth flow has no PKCE verifier.'); return this.verifier; }
  saveDiscoveryState(value: OAuthDiscoveryState): void { this.discovery = value; }
  discoveryState(): OAuthDiscoveryState | undefined { return this.discovery; }
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
    if (scope === 'all' || scope === 'client') this.information = undefined;
    if (scope === 'all' || scope === 'tokens') this.savedTokens = undefined;
    if (scope === 'all' || scope === 'verifier') this.verifier = undefined;
    if (scope === 'all' || scope === 'discovery') this.discovery = undefined;
  }
  getAuthState(): FoAuthState {
    return this.savedTokens ? { status: 'connected', authenticated: true, message: 'OAuth credentials are held in this process; server connectivity is checked separately.' }
      : this.authorizationUrl ? { status: 'authorizing', authenticated: false, message: 'Finish Wajo sign-in in the authorization window.' }
        : { status: 'disconnected', authenticated: false, message: 'Connect your Wajo account. Tokens are kept in memory and cleared on restart.' };
  }
  async startOAuth(serverUrl: URL): Promise<{ authorizationUrl?: string; authenticated: boolean }> {
    this.pendingState = randomBytes(32).toString('base64url'); this.pendingSince = Date.now(); this.authorizationUrl = undefined;
    try { await auth(this, { serverUrl, fetchFn: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) }); }
    catch { throw new Error('Wajo OAuth initialization failed; check the account plan and server configuration.'); }
    return { authorizationUrl: this.authorizationUrl, authenticated: !!this.savedTokens };
  }
  async finishOAuth(serverUrl: URL, code: string, state: string): Promise<FoAuthState> {
    const expected = Buffer.from(this.pendingState ?? '');
    const supplied = Buffer.from(state ?? '');
    if (!code || !this.pendingState || Date.now() - this.pendingSince > 10 * 60_000 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new Error('OAuth state is invalid or expired. Start sign-in again.');
    }
    // Consume the state before exchanging the code: a replay cannot race a second token exchange.
    this.pendingState = undefined;
    try {
      await auth(this, { serverUrl, authorizationCode: code, fetchFn: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) });
      this.authorizationUrl = undefined; this.verifier = undefined;
      return this.getAuthState();
    } catch { throw new Error('Wajo OAuth token exchange failed. Start sign-in again.'); }
  }
}
