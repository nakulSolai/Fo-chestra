import type { LanguageModelV2Middleware } from '@ai-sdk/provider';

/** Stagehand 3.7's generic extraction path otherwise defaults to the provider's
 * 128k output allowance. Bound each request and use native JSON for Claude 5.5;
 * no thinking budget, sampling override, or forced tool use is sent. */
export function extractionMiddleware(signal: AbortSignal, onRequest: () => void = () => {}): LanguageModelV2Middleware {
  let requests = 0;
  return {
    middlewareVersion: 'v2',
    async transformParams({ params }) {
      signal.throwIfAborted();
      // Includes any SDK retries. A malformed response cannot silently run an
      // unbounded recovery loop or repeatedly consume the user's credits.
      if (++requests > 3) throw new Error('Browser extraction request limit reached.');
      onRequest();
      return {
        ...params,
        maxOutputTokens: Math.min(params.maxOutputTokens ?? 2500, 2500),
        abortSignal: signal,
        temperature: undefined, topP: undefined, topK: undefined,
        toolChoice: params.toolChoice?.type === 'tool' || params.toolChoice?.type === 'required'
          ? { type: 'auto' } : params.toolChoice,
        providerOptions: {
          ...params.providerOptions,
          anthropic: { ...params.providerOptions?.anthropic, structuredOutputMode: 'outputFormat', effort: 'medium' },
        },
      };
    },
  };
}
